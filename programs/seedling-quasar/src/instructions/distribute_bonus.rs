use quasar_lang::cpi::{CpiCall, InstructionAccount, Seed};
use quasar_lang::prelude::*;
use quasar_lang::sysvars::Sysvar as _;
use quasar_spl::prelude::*;

use crate::errors::SeedlingError;
use crate::events::BonusDistributed;
use crate::instructions::deposit::{
    DISC_REFRESH_RESERVE, KLEND_PROGRAM_ID, SPL_TOKEN_PROGRAM_ID, SYSVAR_INSTRUCTIONS_ID,
};
use crate::state::{FamilyPosition, KidView, VaultConfig, VAULT_CONFIG_SEED};
use crate::utils::harvest::compute_split;
use crate::utils::shares::burn_family_shares;

const DISC_REDEEM_RESERVE_COLLATERAL: [u8; 8] = [234, 117, 181, 125, 185, 142, 220, 29];

/// Refuse bonuses < 0.01 USDC. Avoids zero-value txs and keeper spam.
pub const BONUS_DUST_THRESHOLD: u64 = 10_000;

/// Period-end "13th allowance" / summer bonus.
///
/// - Time gate: now >= vault_config.period_end_ts
/// - Double-claim guard: family.last_bonus_period_id < vault.current_period_id
/// - Bonus = max(0, family_assets - principal_remaining) — pure yield
/// - Principal is NOT touched (locked Day-3)
/// - 25% fee on the gross yield delta since last harvest
#[derive(Accounts)]
pub struct DistributeBonus {
    #[account(mut)]
    pub keeper: Signer,

    #[account(mut)]
    pub family_position: Account<FamilyPosition>,

    #[account(
        address = KidView::seeds(&family_position.parent, &family_position.kid),
        constraints(kid_view.family_position.eq(family_position.address())) @ SeedlingError::InvalidAuthority,
    )]
    pub kid_view: Account<KidView>,

    #[account(mut)]
    pub kid_usdc_ata: InterfaceAccount<Token>,

    #[account(constraints(kid_owner.address().eq(&family_position.kid)) @ SeedlingError::InvalidAuthority)]
    pub kid_owner: UncheckedAccount,

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

impl DistributeBonus {
    pub fn handler(&mut self) -> Result<(), ProgramError> {
        let now = Clock::get()?.unix_timestamp.get();

        // ---- 1. Period gate + double-claim guard ----
        require!(
            now >= self.vault_config.period_end_ts.get(),
            SeedlingError::BonusPeriodNotEnded
        );
        require!(
            self.family_position.last_bonus_period_id.get()
                < self.vault_config.current_period_id.get(),
            SeedlingError::BonusAlreadyPaid
        );

        let current_period_id = self.vault_config.current_period_id.get();

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

        // ---- 3. Refresh reserve ----
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

        // ---- 5. Compute split + family's bonus ----
        let split = compute_split(
            self.vault_config.last_known_total_assets.get(),
            total_assets_current,
            self.vault_config.fee_bps.get(),
        )?;
        let fee_to_treasury = split.fee_to_treasury;
        let total_assets_post_fee = total_assets_current
            .checked_sub(fee_to_treasury)
            .ok_or(SeedlingError::Underflow)?;

        let total_shares = self.vault_config.total_shares.get();
        require!(total_shares > 0, SeedlingError::InsufficientShares);
        let family_shares = self.family_position.shares.get();
        let family_assets: u64 = {
            let prod = (family_shares as u128)
                .checked_mul(total_assets_post_fee as u128)
                .ok_or(SeedlingError::Overflow)?;
            u64::try_from(
                prod.checked_div(total_shares as u128)
                    .ok_or(SeedlingError::DivisionByZero)?,
            )
            .map_err(|_| SeedlingError::Overflow)?
        };
        let bonus = family_assets.saturating_sub(self.family_position.principal_remaining.get());
        require!(
            bonus > BONUS_DUST_THRESHOLD,
            SeedlingError::BelowDustThreshold
        );

        // ---- 6. Shares + cTokens to burn ----
        let shares_to_burn: u64 = {
            let num = (bonus as u128)
                .checked_mul(total_shares as u128)
                .ok_or(SeedlingError::Overflow)?;
            let denom = (total_assets_post_fee as u128).max(1);
            let raw = num
                .checked_add(denom - 1)
                .ok_or(SeedlingError::Overflow)?
                .checked_div(denom)
                .ok_or(SeedlingError::DivisionByZero)?;
            u64::try_from(raw)
                .map_err(|_| SeedlingError::Overflow)?
                .min(family_shares)
        };

        let total_usdc_to_redeem = bonus
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

        // ---- 7. Redeem (bonus + fee) ----
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

        let vault_usdc_post_redeem = self.vault_usdc_ata.amount.get();
        let actual_usdc_received = vault_usdc_post_redeem.saturating_sub(vault_usdc_pre_redeem);

        let kid_amount = bonus.min(actual_usdc_received);
        let fee_amount = actual_usdc_received
            .saturating_sub(kid_amount)
            .min(fee_to_treasury);

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
        if kid_amount > 0 {
            self.token_program
                .transfer_checked(
                    &self.vault_usdc_ata,
                    &self.usdc_mint,
                    &self.kid_usdc_ata,
                    &self.vault_config,
                    kid_amount,
                    self.usdc_mint.decimals,
                )
                .invoke_signed(&signer_seeds)?;
        }

        // ---- 8. Burn shares atomically ----
        burn_family_shares(
            &mut self.vault_config,
            &mut self.family_position,
            shares_to_burn,
        )?;

        // ---- 9. Accounting: principal NOT touched ----
        let new_yield = self
            .family_position
            .total_yield_earned
            .get()
            .checked_add(kid_amount)
            .ok_or(SeedlingError::Overflow)?;
        self.family_position.total_yield_earned = new_yield.into();
        self.family_position.last_bonus_period_id = current_period_id.into();

        self.vault_config.last_known_total_assets =
            total_assets_post_fee.saturating_sub(kid_amount).into();

        // ---- 10. Emit ----
        let kid_pubkey = self.family_position.kid;
        emit!(BonusDistributed {
            family: *self.family_position.address(),
            kid: kid_pubkey,
            amount: kid_amount,
            fee_to_treasury: fee_amount,
            period_id: current_period_id as u64,
            ts: now,
        });

        Ok(())
    }
}
