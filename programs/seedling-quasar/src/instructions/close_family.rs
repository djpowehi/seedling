use quasar_lang::cpi::{CpiCall, InstructionAccount, Seed};
use quasar_lang::prelude::*;
use quasar_lang::sysvars::Sysvar as _;
use quasar_spl::prelude::*;

use crate::errors::SeedlingError;
use crate::events::FamilyClosed;
use crate::instructions::deposit::{
    DISC_REFRESH_RESERVE, KLEND_PROGRAM_ID, SPL_TOKEN_PROGRAM_ID, SYSVAR_INSTRUCTIONS_ID,
};
use crate::state::{FamilyPosition, KidView, VaultConfig, VAULT_CONFIG_SEED};
use crate::utils::shares::{burn_family_shares, compute_assets_for_shares};

const DISC_REDEEM_RESERVE_COLLATERAL: [u8; 8] = [234, 117, 181, 125, 185, 142, 220, 29];

/// Close a family. Redeems all remaining shares for USDC → parent, then
/// closes both family_position and kid_view PDAs (rent → parent).
///
/// Two paths:
/// - **Empty family** (shares == 0): skips Kamino entirely. Just closes
///   PDAs. Always allowed (even when paused) — parent never gets trapped.
/// - **Non-empty family** (shares > 0): runs the same redeem flow as
///   withdraw. Requires vault not paused.
#[derive(Accounts)]
pub struct CloseFamily {
    #[account(
        mut,
        close(dest = parent),
        constraints(family_position.parent.eq(parent.address())) @ SeedlingError::InvalidAuthority,
    )]
    pub family_position: Account<FamilyPosition>,

    #[account(
        mut,
        close(dest = parent),
        address = KidView::seeds(parent.address(), &family_position.kid),
    )]
    pub kid_view: Account<KidView>,

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

    /// Note: NO is_paused constraint here. Empty-family close must work
    /// even when paused so parent isn't trapped. Non-empty path checks
    /// is_paused inside the handler before doing the redeem.
    #[account(mut, address = VaultConfig::seeds())]
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

impl CloseFamily {
    pub fn handler(&mut self) -> Result<(), ProgramError> {
        let now = Clock::get()?.unix_timestamp.get();
        let shares_to_redeem = self.family_position.shares.get();
        let kid = self.family_position.kid;

        let (assets_paid_out, principal_returned, yield_returned) = if shares_to_redeem == 0 {
            // Empty family — skip Kamino entirely.
            (0u64, 0u64, 0u64)
        } else {
            // Non-empty path. Vault must not be paused for the Kamino flow.
            require!(
                !self.vault_config.is_paused.get(),
                SeedlingError::VaultPaused
            );

            // ---- Oracle validation ----
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

            // ---- Refresh reserve ----
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

            // ---- Path-B math ----
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
                let borrowed =
                    u64::try_from(borrowed_sf >> 60).map_err(|_| SeedlingError::Overflow)?;
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

            // ---- Compute assets out for ALL family shares ----
            let total_shares = self.vault_config.total_shares.get();
            let assets_out =
                compute_assets_for_shares(shares_to_redeem, total_shares, total_assets_current)?;

            // ---- Compute collateral_to_burn (ceil) ----
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
                u64::try_from(raw)
                    .map_err(|_| SeedlingError::Overflow)?
                    .min(vault_ctokens_held)
            };

            // ---- Redeem CPI ----
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

            // ---- Transfer USDC vault → parent (PDA signs) ----
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

            // ---- Burn ALL family shares ----
            burn_family_shares(
                &mut self.vault_config,
                &mut self.family_position,
                shares_to_redeem,
            )?;

            // ---- Principal/yield split (saturating) ----
            let principal_remaining = self.family_position.principal_remaining.get();
            let principal = actual_usdc_to_parent.min(principal_remaining);
            let yield_part = actual_usdc_to_parent.saturating_sub(principal);

            // ---- Update last_known_total_assets ----
            let last_known = self.vault_config.last_known_total_assets.get();
            self.vault_config.last_known_total_assets =
                last_known.saturating_sub(actual_usdc_to_parent).into();

            (actual_usdc_to_parent, principal, yield_part)
        };

        emit!(FamilyClosed {
            family: *self.family_position.address(),
            parent: *self.parent.address(),
            kid,
            shares_redeemed: shares_to_redeem,
            assets_paid_out,
            principal_returned,
            yield_returned,
            ts: now,
        });

        Ok(())
    }
}
