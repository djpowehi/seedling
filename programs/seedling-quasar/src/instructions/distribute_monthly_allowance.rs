use quasar_lang::cpi::{CpiCall, InstructionAccount, Seed};
use quasar_lang::prelude::*;
use quasar_lang::sysvars::Sysvar as _;
use quasar_spl::prelude::*;

use crate::errors::SeedlingError;
use crate::events::MonthlyAllowanceDistributed;
use crate::instructions::deposit::{
    DISC_REFRESH_RESERVE, KLEND_PROGRAM_ID, SPL_TOKEN_PROGRAM_ID, SYSVAR_INSTRUCTIONS_ID,
};
use crate::state::{FamilyPosition, KidView, VaultConfig, VAULT_CONFIG_SEED};
use crate::utils::harvest::compute_split;
use crate::utils::shares::{burn_family_shares, compute_shares_for_assets};

/// klend redeem_reserve_collateral discriminator. Verified Day-4.
const DISC_REDEEM_RESERVE_COLLATERAL: [u8; 8] = [234, 117, 181, 125, 185, 142, 220, 29];

/// 30 days in seconds.
pub const MONTHLY_GATE_SECS: i64 = 30 * 86_400;

/// Distribute the family's `stream_rate` USDC to the kid, monthly-gated.
///
/// Permissionless: anyone can call (Seedling runs a keeper). 30-day gate +
/// has_one(family_position) constraint prevent abuse.
///
/// Principal-first drawdown (Day-3 lock): stream_rate comes out of principal
/// until principal_remaining == 0, then from yield. Bonus at period end
/// claims accumulated yield separately.
///
/// Fee is collected at THIS event (Day-5 timing fix). Yield delta since
/// last harvest is the fee base; 25% of yield to treasury before kid
/// receives allowance. Single Kamino redeem covers (stream_rate + fee).
#[derive(Accounts)]
pub struct DistributeMonthlyAllowance {
    /// Anyone can trigger (permissionless crank). Pays the tx fee but
    /// authorizes nothing — gating is enforced by the 30-day timestamp.
    #[account(mut)]
    pub keeper: Signer,

    #[account(mut)]
    pub family_position: Account<FamilyPosition>,

    #[account(
        address = KidView::seeds(&family_position.parent, &family_position.kid),
        constraints(kid_view.family_position.eq(family_position.address())) @ SeedlingError::InvalidAuthority,
    )]
    pub kid_view: Account<KidView>,

    /// Kid's USDC pool. Owned by the family_position PDA — the family
    /// vault custodies the kid's accumulated allowance until the parent
    /// triggers a payout. Kid never holds a key.
    #[account(
        mut,
        constraints(
            kid_pool_ata.owner.eq(family_position.address())
        ) @ SeedlingError::InvalidAuthority,
        constraints(
            kid_pool_ata.mint.eq(&vault_config.usdc_mint)
        ) @ SeedlingError::MintMismatch,
    )]
    pub kid_pool_ata: InterfaceAccount<Token>,

    #[account(mut)]
    pub vault_usdc_ata: InterfaceAccount<Token>,

    #[account(mut)]
    pub vault_ctoken_ata: InterfaceAccount<Token>,

    #[account(
        mut,
        constraints(treasury_usdc_ata.address().eq(&vault_config.treasury)) @ SeedlingError::InvalidAuthority,
        constraints(treasury_usdc_ata.mint.eq(&vault_config.usdc_mint)) @ SeedlingError::MintMismatch,
    )]
    pub treasury_usdc_ata: InterfaceAccount<Token>,

    #[account(
        mut,
        address = VaultConfig::seeds(),
        constraints(!vault_config.is_paused.get()) @ SeedlingError::VaultPaused,
    )]
    pub vault_config: Account<VaultConfig>,

    #[account(constraints(usdc_mint.address().eq(&vault_config.usdc_mint)) @ SeedlingError::MintMismatch)]
    pub usdc_mint: InterfaceAccount<Mint>,

    #[account(
        mut,
        constraints(ctoken_mint.address().eq(&vault_config.ctoken_mint)) @ SeedlingError::MintMismatch,
    )]
    pub ctoken_mint: InterfaceAccount<Mint>,

    #[account(
        mut,
        constraints(kamino_reserve.address().eq(&vault_config.kamino_reserve)) @ SeedlingError::ReserveMismatch,
    )]
    pub kamino_reserve: UncheckedAccount,

    pub lending_market: UncheckedAccount,

    pub lending_market_authority: UncheckedAccount,

    #[account(mut)]
    pub reserve_liquidity_supply: UncheckedAccount,

    // dup flags — same rationale as deposit.rs.
    /// CHECK: validated against vault_config.oracle_pyth; dup ok.
    #[account(dup)]
    pub oracle_pyth: UncheckedAccount,
    /// CHECK: validated against vault_config.oracle_switchboard_price; dup ok.
    #[account(dup)]
    pub oracle_switchboard_price: UncheckedAccount,
    /// CHECK: validated against vault_config.oracle_switchboard_twap; dup ok.
    #[account(dup)]
    pub oracle_switchboard_twap: UncheckedAccount,
    /// CHECK: validated against vault_config.oracle_scope_config; dup ok.
    #[account(dup)]
    pub oracle_scope_config: UncheckedAccount,

    /// CHECK: address-constrained to KLEND_PROGRAM_ID; dup ok.
    #[account(dup, address = KLEND_PROGRAM_ID)]
    pub kamino_program: UncheckedAccount,

    #[account(address = SYSVAR_INSTRUCTIONS_ID)]
    pub instruction_sysvar: UncheckedAccount,

    pub token_program: Interface<TokenInterface>,
    pub associated_token_program: Program<AssociatedTokenProgram>,
    pub system_program: Program<SystemProgram>,
}

impl DistributeMonthlyAllowance {
    pub fn handler(&mut self) -> Result<(), ProgramError> {
        let now = Clock::get()?.unix_timestamp.get();

        // ---- 1. 30-day gate ----
        let last_dist = self.family_position.last_distribution.get();
        let elapsed_required = last_dist
            .checked_add(MONTHLY_GATE_SECS)
            .ok_or(SeedlingError::Overflow)?;
        require!(now >= elapsed_required, SeedlingError::TooEarly);

        let stream_rate = self.family_position.stream_rate.get();
        require!(stream_rate > 0, SeedlingError::InvalidAmount);

        // ---- 2. Oracle validation ----
        let zero = Address::default();
        if !self.vault_config.oracle_pyth.eq(&zero) {
            require_keys_eq!(
                *self.oracle_pyth.address(),
                self.vault_config.oracle_pyth,
                SeedlingError::InvalidOracle
            );
        }
        if !self.vault_config.oracle_switchboard_price.eq(&zero) {
            require_keys_eq!(
                *self.oracle_switchboard_price.address(),
                self.vault_config.oracle_switchboard_price,
                SeedlingError::InvalidOracle
            );
        }
        if !self.vault_config.oracle_switchboard_twap.eq(&zero) {
            require_keys_eq!(
                *self.oracle_switchboard_twap.address(),
                self.vault_config.oracle_switchboard_twap,
                SeedlingError::InvalidOracle
            );
        }
        if !self.vault_config.oracle_scope_config.eq(&zero) {
            require_keys_eq!(
                *self.oracle_scope_config.address(),
                self.vault_config.oracle_scope_config,
                SeedlingError::InvalidOracle
            );
        }

        // ---- 3. Refresh Kamino reserve ----
        let refresh_call: CpiCall<6, 8> = CpiCall::new(
            &KLEND_PROGRAM_ID,
            [
                InstructionAccount::writable(self.kamino_reserve.address()),
                InstructionAccount::readonly(self.lending_market.address()),
                InstructionAccount::readonly(self.oracle_pyth.address()),
                InstructionAccount::readonly(self.oracle_switchboard_price.address()),
                InstructionAccount::readonly(self.oracle_switchboard_twap.address()),
                InstructionAccount::readonly(self.oracle_scope_config.address()),
            ],
            [
                self.kamino_reserve.to_account_view(),
                self.lending_market.to_account_view(),
                self.oracle_pyth.to_account_view(),
                self.oracle_switchboard_price.to_account_view(),
                self.oracle_switchboard_twap.to_account_view(),
                self.oracle_scope_config.to_account_view(),
            ],
            DISC_REFRESH_RESERVE,
        );
        refresh_call.invoke()?;

        let vault_usdc_pre_redeem = self.vault_usdc_ata.amount.get();

        // ---- 4. Path-B math ----
        let (kamino_total_liquidity, collateral_supply, total_assets_current) = {
            let reserve_view = self.kamino_reserve.to_account_view();
            let reserve_data = reserve_view.try_borrow()?;
            require!(
                reserve_data.len() >= 248,
                SeedlingError::InvalidKaminoAccount
            );
            let total_available = u64::from_le_bytes(
                reserve_data[224..232]
                    .try_into()
                    .map_err(|_| SeedlingError::InvalidKaminoAccount)?,
            );
            let borrowed_sf = u128::from_le_bytes(
                reserve_data[232..248]
                    .try_into()
                    .map_err(|_| SeedlingError::InvalidKaminoAccount)?,
            );
            let borrowed = u64::try_from(borrowed_sf >> 60).map_err(|_| SeedlingError::Overflow)?;
            let total_liquidity = total_available
                .checked_add(borrowed)
                .ok_or(SeedlingError::Overflow)?;
            let supply = self.ctoken_mint.supply.get();
            let held = self.vault_ctoken_ata.amount.get();
            let total = if held == 0 || supply == 0 {
                0u64
            } else {
                let prod = (held as u128)
                    .checked_mul(total_liquidity as u128)
                    .ok_or(SeedlingError::Overflow)?;
                u64::try_from(
                    prod.checked_div(supply as u128)
                        .ok_or(SeedlingError::DivisionByZero)?,
                )
                .map_err(|_| SeedlingError::Overflow)?
            };
            (total_liquidity, supply, total)
        };

        // ---- 5. Compute split (last_known → current = yield delta) ----
        let split = compute_split(
            self.vault_config.last_known_total_assets.get(),
            total_assets_current,
            self.vault_config.fee_bps.get(),
        )?;
        let fee_to_treasury = split.fee_to_treasury;

        // ---- 6. Share math ----
        // Use post-fee total_assets so the kid's stream_rate is share-priced
        // against the pool AFTER the fee conceptually leaves.
        let total_assets_post_fee = total_assets_current
            .checked_sub(fee_to_treasury)
            .ok_or(SeedlingError::Underflow)?;
        let total_shares = self.vault_config.total_shares.get();
        require!(total_shares > 0, SeedlingError::InsufficientShares);
        let shares_to_burn =
            compute_shares_for_assets(stream_rate, total_shares, total_assets_post_fee.max(1))?;
        require!(
            self.family_position.shares.get() >= shares_to_burn,
            SeedlingError::InsufficientShares
        );

        // ---- 7. Redeem (stream_rate + fee) in ONE CPI ----
        let total_usdc_to_redeem = stream_rate
            .checked_add(fee_to_treasury)
            .ok_or(SeedlingError::Overflow)?;
        let vault_ctokens_held = self.vault_ctoken_ata.amount.get();
        let collateral_to_burn: u64 = {
            let num = (total_usdc_to_redeem as u128)
                .checked_mul(collateral_supply as u128)
                .ok_or(SeedlingError::Overflow)?;
            let raw = num
                .checked_add((kamino_total_liquidity as u128).saturating_sub(1))
                .ok_or(SeedlingError::Overflow)?
                .checked_div(kamino_total_liquidity as u128)
                .ok_or(SeedlingError::DivisionByZero)?;
            u64::try_from(raw)
                .map_err(|_| SeedlingError::Overflow)?
                .min(vault_ctokens_held)
        };

        let vault_bump = self.vault_config.bump;
        let bump_seed = [vault_bump];
        let signer_seeds = [Seed::from(VAULT_CONFIG_SEED), Seed::from(&bump_seed)];

        let mut redeem_data: [u8; 16] = [0u8; 16];
        redeem_data[..8].copy_from_slice(&DISC_REDEEM_RESERVE_COLLATERAL);
        redeem_data[8..].copy_from_slice(&collateral_to_burn.to_le_bytes());

        let redeem_call: CpiCall<12, 16> = CpiCall::new(
            &KLEND_PROGRAM_ID,
            [
                InstructionAccount::readonly_signer(self.vault_config.address()),
                InstructionAccount::readonly(self.lending_market.address()),
                InstructionAccount::writable(self.kamino_reserve.address()),
                InstructionAccount::readonly(self.lending_market_authority.address()),
                InstructionAccount::readonly(self.usdc_mint.address()),
                InstructionAccount::writable(self.ctoken_mint.address()),
                InstructionAccount::writable(self.reserve_liquidity_supply.address()),
                InstructionAccount::writable(self.vault_ctoken_ata.address()),
                InstructionAccount::writable(self.vault_usdc_ata.address()),
                InstructionAccount::readonly(&SPL_TOKEN_PROGRAM_ID),
                InstructionAccount::readonly(self.token_program.address()),
                InstructionAccount::readonly(self.instruction_sysvar.address()),
            ],
            [
                self.vault_config.to_account_view(),
                self.lending_market.to_account_view(),
                self.kamino_reserve.to_account_view(),
                self.lending_market_authority.to_account_view(),
                self.usdc_mint.to_account_view(),
                self.ctoken_mint.to_account_view(),
                self.reserve_liquidity_supply.to_account_view(),
                self.vault_ctoken_ata.to_account_view(),
                self.vault_usdc_ata.to_account_view(),
                self.token_program.to_account_view(),
                self.token_program.to_account_view(),
                self.instruction_sysvar.to_account_view(),
            ],
            redeem_data,
        );
        redeem_call.invoke_signed(&signer_seeds)?;

        // ---- 8. Split actual USDC: fee → treasury, stream_rate → kid ----
        // If Kamino returned slightly less than (stream_rate + fee), the kid
        // gets paid first; fee gets shaved. Same dust-absorption strategy as
        // withdraw.
        let vault_usdc_post_redeem = self.vault_usdc_ata.amount.get();
        let actual_usdc_received = vault_usdc_post_redeem.saturating_sub(vault_usdc_pre_redeem);

        let kid_amount = stream_rate.min(actual_usdc_received);
        let fee_amount = actual_usdc_received
            .saturating_sub(kid_amount)
            .min(fee_to_treasury);

        // Fee transfer (no-op if 0).
        if fee_amount > 0 {
            self.token_program
                .transfer_checked(
                    &self.vault_usdc_ata,
                    &self.usdc_mint,
                    &self.treasury_usdc_ata,
                    &self.vault_config,
                    fee_amount,
                    self.usdc_mint.decimals,
                )
                .invoke_signed(&signer_seeds)?;
        }

        // Kid transfer.
        if kid_amount > 0 {
            self.token_program
                .transfer_checked(
                    &self.vault_usdc_ata,
                    &self.usdc_mint,
                    &self.kid_pool_ata,
                    &self.vault_config,
                    kid_amount,
                    self.usdc_mint.decimals,
                )
                .invoke_signed(&signer_seeds)?;
        }

        // ---- 9. Burn shares atomically ----
        burn_family_shares(
            &mut self.vault_config,
            &mut self.family_position,
            shares_to_burn,
        )?;

        // ---- 10. Principal-first drawdown ----
        let principal_remaining = self.family_position.principal_remaining.get();
        let principal_drawdown = kid_amount.min(principal_remaining);
        let yield_drawdown = kid_amount.saturating_sub(principal_drawdown);

        self.family_position.principal_remaining = principal_remaining
            .saturating_sub(principal_drawdown)
            .into();
        let new_yield = self
            .family_position
            .total_yield_earned
            .get()
            .checked_add(yield_drawdown)
            .ok_or(SeedlingError::Overflow)?;
        self.family_position.total_yield_earned = new_yield.into();
        self.family_position.last_distribution = now.into();

        // ---- 11. last_known_total_assets ----
        // Vault's cToken value dropped by ~kid_amount (fee + redeem dust
        // doesn't change pool's USDC-equivalent value from our POV — it's
        // accounted for in the fee skim).
        self.vault_config.last_known_total_assets =
            total_assets_post_fee.saturating_sub(kid_amount).into();

        // ---- 12. Emit ----
        let kid_pubkey = self.family_position.kid;
        emit!(MonthlyAllowanceDistributed {
            family: *self.family_position.address(),
            kid: kid_pubkey,
            stream_rate: kid_amount,
            principal_drawdown,
            yield_drawdown,
            fee_to_treasury: fee_amount,
            ts: now,
        });

        Ok(())
    }
}
