use quasar_lang::cpi::{CpiCall, InstructionAccount, Seed};
use quasar_lang::prelude::*;
use quasar_lang::sysvars::Sysvar as _;
use quasar_spl::prelude::*;

use crate::errors::SeedlingError;
use crate::events::Withdrawn;
use crate::instructions::deposit::{
    DISC_REFRESH_RESERVE, KLEND_PROGRAM_ID, SPL_TOKEN_PROGRAM_ID, SYSVAR_INSTRUCTIONS_ID,
};
use crate::state::{FamilyPosition, VaultConfig, VAULT_CONFIG_SEED};
use crate::utils::shares::{burn_family_shares, compute_assets_for_shares};

/// klend redeem_reserve_collateral discriminator. Verified Day-4.
const DISC_REDEEM_RESERVE_COLLATERAL: [u8; 8] = [234, 117, 181, 125, 185, 142, 220, 29];

/// Withdraw USDC ← Kamino ← vault → parent. Burns family shares pro-rata.
///
/// Symmetric opposite of deposit. Key differences:
/// - has_one(parent) — only the family's parent can withdraw
/// - Slippage is `assets_out >= min_assets_out` (deposit is `min_shares_out`)
/// - principal_remaining uses saturating_sub (Day-3 lock — yield-above-principal
///   clamps to 0, never negative)
/// - Kamino redeem_reserve_collateral takes `collateral_amount` (cTokens to
///   burn). We ceil(assets_out × ctoken_supply / total_liquidity) so we burn
///   ENOUGH cTokens to receive at least assets_out USDC.
/// - Use ACTUAL USDC delta (vault post - pre) for parent transfer, not the
///   precomputed assets_out — Kamino's internal rounding may return 1-2
///   base units less.
#[derive(Accounts)]
pub struct Withdraw {
    #[account(
        mut,
        constraints(family_position.parent.eq(parent.address())) @ SeedlingError::InvalidAuthority,
    )]
    pub family_position: Account<FamilyPosition>,

    #[account(mut)]
    pub parent: Signer,

    #[account(
        mut,
        constraints(parent_usdc_ata.mint.eq(&vault_config.usdc_mint)) @ SeedlingError::MintMismatch,
        constraints(parent_usdc_ata.owner.eq(parent.address())) @ SeedlingError::InvalidAuthority,
    )]
    pub parent_usdc_ata: InterfaceAccount<Token>,

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

    /// Kamino burns cTokens during redeem, so ctoken_mint must be mut.
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

    /// Kamino moves USDC FROM here TO vault_usdc_ata.
    #[account(mut)]
    pub reserve_liquidity_supply: UncheckedAccount,

    pub oracle_pyth: UncheckedAccount,
    pub oracle_switchboard_price: UncheckedAccount,
    pub oracle_switchboard_twap: UncheckedAccount,
    pub oracle_scope_config: UncheckedAccount,

    #[account(address = KLEND_PROGRAM_ID)]
    pub kamino_program: UncheckedAccount,

    #[account(address = SYSVAR_INSTRUCTIONS_ID)]
    pub instruction_sysvar: UncheckedAccount,

    pub token_program: Interface<TokenInterface>,
    pub associated_token_program: Program<AssociatedTokenProgram>,
    pub system_program: Program<SystemProgram>,
}

impl Withdraw {
    pub fn handler(
        &mut self,
        shares_to_burn: u64,
        min_assets_out: u64,
    ) -> Result<(), ProgramError> {
        require!(shares_to_burn > 0, SeedlingError::InvalidAmount);
        require!(
            self.family_position.shares.get() >= shares_to_burn,
            SeedlingError::InsufficientShares
        );

        // ---- 1. Oracle validation ----
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

        // ---- 2. Kamino refresh_reserve CPI ----
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

        // Snapshot vault USDC pre-redeem so we can measure the actual delta
        // Kamino returns (their internal rounding may differ from our estimate).
        let vault_usdc_pre_redeem = self.vault_usdc_ata.amount.get();

        // ---- 3. Path-B exchange-rate math ----
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

        let total_shares = self.vault_config.total_shares.get();
        let assets_out =
            compute_assets_for_shares(shares_to_burn, total_shares, total_assets_current)?;

        require!(
            assets_out >= min_assets_out,
            SeedlingError::SlippageExceeded
        );
        require!(assets_out > 0, SeedlingError::BelowDustThreshold);

        // ---- 4. Compute collateral_to_burn (ceil so user gets ≥ assets_out) ----
        let vault_ctokens_held = self.vault_ctoken_ata.amount.get();
        let collateral_to_burn: u64 = {
            let num = (assets_out as u128)
                .checked_mul(collateral_supply as u128)
                .ok_or(SeedlingError::Overflow)?;
            let raw = num
                .checked_add((kamino_total_liquidity as u128).saturating_sub(1))
                .ok_or(SeedlingError::Overflow)?
                .checked_div(kamino_total_liquidity as u128)
                .ok_or(SeedlingError::DivisionByZero)?;
            let c = u64::try_from(raw).map_err(|_| SeedlingError::Overflow)?;
            c.min(vault_ctokens_held)
        };

        // ---- 5. PDA signer seeds (vault_config) ----
        let vault_bump = self.vault_config.bump;
        let bump_seed = [vault_bump];
        let signer_seeds = [Seed::from(VAULT_CONFIG_SEED), Seed::from(&bump_seed)];

        // ---- 6. Kamino redeem_reserve_collateral CPI ----
        // 12 accounts, 16 bytes data. Account order per klend
        // handler_redeem_reserve_collateral.rs.
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

        // ---- 7. Transfer USDC vault → parent (PDA signs) ----
        // Use ACTUAL delta, not precomputed assets_out — Kamino's rounding
        // may return 1-2 units less. min(actual, assets_out) clamps to what
        // we actually have.
        let vault_usdc_post_redeem = self.vault_usdc_ata.amount.get();
        let actual_usdc_to_parent = vault_usdc_post_redeem
            .saturating_sub(vault_usdc_pre_redeem)
            .min(assets_out);

        self.token_program
            .transfer_checked(
                &self.vault_usdc_ata,
                &self.usdc_mint,
                &self.parent_usdc_ata,
                &self.vault_config,
                actual_usdc_to_parent,
                self.usdc_mint.decimals,
            )
            .invoke_signed(&signer_seeds)?;

        let assets_out = actual_usdc_to_parent;

        // ---- 8. Burn family shares atomically ----
        burn_family_shares(
            &mut self.vault_config,
            &mut self.family_position,
            shares_to_burn,
        )?;

        // ---- 9. Principal accounting (saturating_sub — Day-3 lock) ----
        let principal_remaining = self.family_position.principal_remaining.get();
        let principal_drawdown = assets_out.min(principal_remaining);
        let yield_drawdown = assets_out.saturating_sub(principal_drawdown);

        let new_principal_remaining = principal_remaining.saturating_sub(assets_out);
        self.family_position.principal_remaining = new_principal_remaining.into();

        let new_yield_earned = self
            .family_position
            .total_yield_earned
            .get()
            .checked_add(yield_drawdown)
            .ok_or(SeedlingError::Overflow)?;
        self.family_position.total_yield_earned = new_yield_earned.into();

        // ---- 10. Update last_known_total_assets ----
        let last_known = self.vault_config.last_known_total_assets.get();
        self.vault_config.last_known_total_assets = last_known.saturating_sub(assets_out).into();

        // ---- 11. Emit ----
        let now = Clock::get()?.unix_timestamp.get();
        emit!(Withdrawn {
            family: *self.family_position.address(),
            parent: *self.parent.address(),
            shares_burned: shares_to_burn,
            assets_out,
            principal_drawdown,
            yield_drawdown,
            fee_to_treasury: 0, // harvest_and_fee at withdraw is post-MVP
            ts: now,
        });

        Ok(())
    }
}
