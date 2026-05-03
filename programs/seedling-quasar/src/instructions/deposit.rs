use core::mem::MaybeUninit;

use quasar_lang::cpi::{CpiCall, InstructionAccount, Seed};
use quasar_lang::prelude::*;
use quasar_lang::sysvars::Sysvar as _;
use quasar_spl::prelude::*;

use crate::errors::SeedlingError;
use crate::events::Deposited;
use crate::state::{FamilyPosition, VaultConfig, VAULT_CONFIG_SEED};
use crate::utils::shares::{compute_shares_to_mint, mint_family_shares};

/// Kamino klend program ID. Same on mainnet + devnet.
pub const KLEND_PROGRAM_ID: Address = address!("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");

/// SPL Token program ID — passed as a CPI account in deposit_reserve_liquidity
/// (klend's `collateral_token_program` slot). Different from `token_program`
/// which is `TokenInterface` (for Token-2022 compat).
pub const SPL_TOKEN_PROGRAM_ID: Address = address!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

/// Anchor discriminators for the two Kamino instructions we hit.
/// sha256("global:refresh_reserve")[0..8] and sha256("global:deposit_reserve_liquidity")[0..8].
/// Verified against klend lib.rs in Day-4 of the Anchor port.
pub const DISC_REFRESH_RESERVE: [u8; 8] = [2, 218, 138, 235, 79, 201, 25, 102];
pub const DISC_DEPOSIT_RESERVE_LIQUIDITY: [u8; 8] = [169, 201, 30, 126, 6, 205, 102, 68];

pub const SYSVAR_INSTRUCTIONS_ID: Address = address!("Sysvar1nstructions1111111111111111111111111");

/// Deposit USDC → vault → Kamino. Mints family shares pro-rata.
///
/// Flow:
///   1. Validate amount + oracles
///   2. transfer_checked depositor_usdc → vault_usdc
///   3. CPI klend::refresh_reserve (no signer)
///   4. Read kamino_reserve raw bytes for Path-B exchange-rate math
///   5. CPI klend::deposit_reserve_liquidity (vault_config PDA signs)
///   6. compute_shares_to_mint + slippage guard
///   7. mint_family_shares (atomic with vault.total_shares)
///   8. Update principal_deposited / principal_remaining / last_known_total_assets
///   9. Emit Deposited
#[derive(Accounts)]
pub struct Deposit {
    // Gift mode: any wallet can deposit. Off-chain consumers tell gifts from
    // top-ups by comparing event.depositor vs family.parent.
    #[account(mut)]
    pub family_position: Account<FamilyPosition>,

    #[account(mut)]
    pub depositor: Signer,

    #[account(
        mut,
        constraints(
            depositor_usdc_ata.mint.eq(&vault_config.usdc_mint)
        ) @ SeedlingError::MintMismatch,
        constraints(
            depositor_usdc_ata.owner.eq(depositor.address())
        ) @ SeedlingError::InvalidAuthority,
    )]
    pub depositor_usdc_ata: InterfaceAccount<Token>,

    #[account(mut)]
    pub vault_usdc_ata: InterfaceAccount<Token>,

    #[account(mut)]
    pub vault_ctoken_ata: InterfaceAccount<Token>,

    #[account(
        mut,
        constraints(
            treasury_usdc_ata.address().eq(&vault_config.treasury)
        ) @ SeedlingError::InvalidAuthority,
        constraints(
            treasury_usdc_ata.mint.eq(&vault_config.usdc_mint)
        ) @ SeedlingError::MintMismatch,
    )]
    pub treasury_usdc_ata: InterfaceAccount<Token>,

    #[account(
        mut,
        address = VaultConfig::seeds(),
        constraints(!vault_config.is_paused.get()) @ SeedlingError::VaultPaused,
    )]
    pub vault_config: Account<VaultConfig>,

    #[account(
        constraints(usdc_mint.address().eq(&vault_config.usdc_mint)) @ SeedlingError::MintMismatch
    )]
    pub usdc_mint: InterfaceAccount<Mint>,

    /// Must be mut — Kamino mints new cTokens into it on deposit.
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

    /// Validated transitively via klend's reserve.has_one check inside the CPI.
    pub lending_market: UncheckedAccount,

    /// Validated by klend's PDA check inside deposit_reserve_liquidity.
    pub lending_market_authority: UncheckedAccount,

    /// Kamino's USDC supply vault. Mut because deposit sends USDC into it.
    #[account(mut)]
    pub reserve_liquidity_supply: UncheckedAccount,

    // 4 oracle slots — caller passes klend program ID for unused slots
    // (matches Kamino's Option<AccountInfo> sentinel convention). Quasar
    // requires explicit `dup` to allow these to share the same address with
    // each other or with `kamino_program` below; without `dup`, parse_accounts
    // fails with AccountBorrowFailed when 2+ slots map to the same pubkey.
    /// CHECK: validated against vault_config.oracle_pyth in handler; dup
    /// allowed so caller can use klend program ID as a "None" sentinel.
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

    /// CHECK: address-constrained to KLEND_PROGRAM_ID; dup allowed because
    /// the unused oracle slots above commonly share this same address.
    #[account(dup, address = KLEND_PROGRAM_ID)]
    pub kamino_program: UncheckedAccount,

    #[account(address = SYSVAR_INSTRUCTIONS_ID)]
    pub instruction_sysvar: UncheckedAccount,

    pub token_program: Interface<TokenInterface>,
    pub associated_token_program: Program<AssociatedTokenProgram>,
    pub system_program: Program<SystemProgram>,
}

impl Deposit {
    pub fn handler(&mut self, amount: u64, min_shares_out: u64) -> Result<(), ProgramError> {
        require!(amount > 0, SeedlingError::InvalidAmount);

        // ---- 1. Oracle validation ----
        // When the cached oracle is non-default, the passed account must
        // match. Default == "not configured on this reserve" — accept any
        // passed pubkey (caller should pass klend program ID as Kamino's
        // None sentinel).
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

        // ---- 2. Transfer USDC depositor → vault ----
        self.token_program
            .transfer_checked(
                &self.depositor_usdc_ata,
                &self.usdc_mint,
                &self.vault_usdc_ata,
                &self.depositor,
                amount,
                self.usdc_mint.decimals,
            )
            .invoke()?;

        // ---- 3. Kamino refresh_reserve CPI ----
        // 6 accounts, 8 bytes data (discriminator only).
        let refresh_data: [u8; 8] = DISC_REFRESH_RESERVE;
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
            refresh_data,
        );
        refresh_call.invoke()?;

        // ---- 4. Path-B exchange-rate math ----
        // total_assets_pre_deposit = cTokens_held × (supply_vault_amount + borrowed) / collateral_supply
        // Reading raw bytes from kamino_reserve at known offsets is faster
        // than deserializing the 8624-byte zero-copy Reserve struct.
        //
        // Offsets (verified Day 5 against klend reserve.rs):
        //   discriminator(8) + version(8) + last_update(16) + lending_market(32)
        //   + farm_collateral(32) + farm_debt(32) = 128
        //   + ReserveLiquidity: mint(32) + supply_vault(32) + fee_vault(32) = 96
        //   = 224: total_available_amount (u64, 8 bytes) → ends at 232
        //   = 232: borrowed_amount_sf (u128, 16 bytes, scaled by 2^60) → ends at 248
        let total_assets_pre_deposit: u64 = {
            let reserve_view = self.kamino_reserve.to_account_view();
            let reserve_data = reserve_view.try_borrow()?;
            require!(
                reserve_data.len() >= 248,
                SeedlingError::InvalidKaminoAccount
            );
            let total_available_amount = u64::from_le_bytes(
                reserve_data[224..232]
                    .try_into()
                    .map_err(|_| SeedlingError::InvalidKaminoAccount)?,
            );
            let borrowed_amount_sf = u128::from_le_bytes(
                reserve_data[232..248]
                    .try_into()
                    .map_err(|_| SeedlingError::InvalidKaminoAccount)?,
            );
            // Unscale U68F60: top 68 bits are integer part. >> 60 = floor(raw / 2^60).
            let borrowed_amount =
                u64::try_from(borrowed_amount_sf >> 60).map_err(|_| SeedlingError::Overflow)?;
            let kamino_total_liquidity = total_available_amount
                .checked_add(borrowed_amount)
                .ok_or(SeedlingError::Overflow)?;

            let collateral_supply = self.ctoken_mint.supply.get();
            let vault_ctokens_held = self.vault_ctoken_ata.amount.get();

            if vault_ctokens_held == 0 || collateral_supply == 0 {
                0u64
            } else {
                let prod = (vault_ctokens_held as u128)
                    .checked_mul(kamino_total_liquidity as u128)
                    .ok_or(SeedlingError::Overflow)?;
                let assets = prod
                    .checked_div(collateral_supply as u128)
                    .ok_or(SeedlingError::DivisionByZero)?;
                u64::try_from(assets).map_err(|_| SeedlingError::Overflow)?
            }
        };

        // Day-5 design: deposit does NOT skim a fee. Kamino sweeps
        // vault_usdc_ata clean on deposit, so there's no loose USDC for
        // the treasury. Fees are collected at events that already redeem
        // (withdraw, distribute_*). Pre-deposit yield delta is captured in
        // total_assets_pre_deposit; next harvest sees it.
        let fee_to_treasury: u64 = 0;
        let total_assets_post_fee = total_assets_pre_deposit;

        // ---- 5. Kamino deposit_reserve_liquidity CPI ----
        // 12 accounts, 16 bytes data (8 disc + 8 amount LE).
        // vault_config PDA is the signer (owner slot).
        let mut deposit_data: [u8; 16] = [0u8; 16];
        deposit_data[..8].copy_from_slice(&DISC_DEPOSIT_RESERVE_LIQUIDITY);
        deposit_data[8..].copy_from_slice(&amount.to_le_bytes());

        let vault_bump = self.vault_config.bump;
        let bump_seed = [vault_bump];
        let signer_seeds = [Seed::from(VAULT_CONFIG_SEED), Seed::from(&bump_seed)];

        let deposit_call: CpiCall<12, 16> = CpiCall::new(
            &KLEND_PROGRAM_ID,
            [
                InstructionAccount::readonly_signer(self.vault_config.address()),
                InstructionAccount::writable(self.kamino_reserve.address()),
                InstructionAccount::readonly(self.lending_market.address()),
                InstructionAccount::readonly(self.lending_market_authority.address()),
                InstructionAccount::readonly(self.usdc_mint.address()),
                InstructionAccount::writable(self.reserve_liquidity_supply.address()),
                InstructionAccount::writable(self.ctoken_mint.address()),
                InstructionAccount::writable(self.vault_usdc_ata.address()),
                InstructionAccount::writable(self.vault_ctoken_ata.address()),
                InstructionAccount::readonly(&SPL_TOKEN_PROGRAM_ID),
                InstructionAccount::readonly(self.token_program.address()),
                InstructionAccount::readonly(self.instruction_sysvar.address()),
            ],
            [
                self.vault_config.to_account_view(),
                self.kamino_reserve.to_account_view(),
                self.lending_market.to_account_view(),
                self.lending_market_authority.to_account_view(),
                self.usdc_mint.to_account_view(),
                self.reserve_liquidity_supply.to_account_view(),
                self.ctoken_mint.to_account_view(),
                self.vault_usdc_ata.to_account_view(),
                self.vault_ctoken_ata.to_account_view(),
                self.token_program.to_account_view(),
                self.token_program.to_account_view(),
                self.instruction_sysvar.to_account_view(),
            ],
            deposit_data,
        );
        deposit_call.invoke_signed(&signer_seeds)?;

        // ---- 6. Shares math (kvault, Path A first-depositor defense) ----
        let total_shares_pre = self.vault_config.total_shares.get();
        let shares_to_mint =
            compute_shares_to_mint(amount, total_shares_pre, total_assets_post_fee)?;

        // ---- 7. Slippage guard ----
        require!(
            shares_to_mint >= min_shares_out,
            SeedlingError::SlippageExceeded
        );

        // ---- 8. Atomic mint + principal update ----
        mint_family_shares(
            &mut self.vault_config,
            &mut self.family_position,
            shares_to_mint,
        )?;

        let new_principal_deposited = self
            .family_position
            .principal_deposited
            .get()
            .checked_add(amount)
            .ok_or(SeedlingError::Overflow)?;
        let new_principal_remaining = self
            .family_position
            .principal_remaining
            .get()
            .checked_add(amount)
            .ok_or(SeedlingError::Overflow)?;
        self.family_position.principal_deposited = new_principal_deposited.into();
        self.family_position.principal_remaining = new_principal_remaining.into();

        let new_last_known = total_assets_post_fee
            .checked_add(amount)
            .ok_or(SeedlingError::Overflow)?;
        self.vault_config.last_known_total_assets = new_last_known.into();

        // ---- 9. Emit ----
        let now = Clock::get()?.unix_timestamp.get();
        let _ = MaybeUninit::<()>::uninit; // suppress unused import warn if MaybeUninit unused
        emit!(Deposited {
            family: *self.family_position.address(),
            depositor: *self.depositor.address(),
            amount,
            shares_minted: shares_to_mint,
            fee_to_treasury,
            ts: now,
        });

        Ok(())
    }
}
