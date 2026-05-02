use quasar_lang::prelude::*;
use quasar_spl::prelude::*;

use crate::errors::SeedlingError;
use crate::state::{FamilyPosition, VaultConfig};

/// Kamino klend program ID. Same on mainnet + devnet — single change here if
/// they ever redeploy.
pub const KLEND_PROGRAM_ID: Address = address!("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");

/// Anchor discriminators for the two Kamino instructions we hit.
/// sha256("global:refresh_reserve")[0..8] and sha256("global:deposit_reserve_liquidity")[0..8].
/// Verified against klend lib.rs in Day-4 of the Anchor port.
pub const DISC_REFRESH_RESERVE: [u8; 8] = [2, 218, 138, 235, 79, 201, 25, 102];
pub const DISC_DEPOSIT_RESERVE_LIQUIDITY: [u8; 8] = [169, 201, 30, 126, 6, 205, 102, 68];

/// Instruction-introspection sysvar address. Hardcoded to skip a Sysvar
/// indirection — klend just wants the address as a CPI account.
pub const SYSVAR_INSTRUCTIONS_ID: Address = address!("Sysvar1nstructions1111111111111111111111111");

/// Deposit USDC → vault → Kamino. Mints family shares pro-rata.
///
/// **TODO (next session):** Kamino CPI bodies (refresh_reserve +
/// deposit_reserve_liquidity) plus Path-B precision math reading raw bytes
/// from `kamino_reserve` at offsets 224 (total_available_amount) and 232
/// (borrowed_amount_sf). Account shape + share math are in place so the
/// instruction parses; the handler currently fails fast with a placeholder
/// error if invoked.
#[derive(Accounts)]
pub struct Deposit {
    // Gift mode: any wallet can deposit into any family. Off-chain consumers
    // tell gifts from top-ups by comparing event.depositor vs family.parent.
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

    #[account(constraints(usdc_mint.address().eq(&vault_config.usdc_mint)) @ SeedlingError::MintMismatch)]
    pub usdc_mint: InterfaceAccount<Mint>,

    /// Must be mut — Kamino mints new cTokens into it on deposit.
    #[account(
        mut,
        constraints(ctoken_mint.address().eq(&vault_config.ctoken_mint)) @ SeedlingError::MintMismatch,
    )]
    pub ctoken_mint: InterfaceAccount<Mint>,

    // ===== Kamino CPI accounts =====
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
    // (matches Kamino's Option<AccountInfo> sentinel convention).
    pub oracle_pyth: UncheckedAccount,
    pub oracle_switchboard_price: UncheckedAccount,
    pub oracle_switchboard_twap: UncheckedAccount,
    pub oracle_scope_config: UncheckedAccount,

    /// Address-constrained to prevent arbitrary-CPI substitution.
    #[account(address = KLEND_PROGRAM_ID)]
    pub kamino_program: UncheckedAccount,

    #[account(address = SYSVAR_INSTRUCTIONS_ID)]
    pub instruction_sysvar: UncheckedAccount,

    pub token_program: Interface<TokenInterface>,
    pub associated_token_program: Program<AssociatedTokenProgram>,
    pub system_program: Program<SystemProgram>,
}

impl Deposit {
    #[inline(always)]
    pub fn handler(&mut self, amount: u64, _min_shares_out: u64) -> Result<(), ProgramError> {
        require!(amount > 0, SeedlingError::InvalidAmount);

        // TODO(next session): full body
        //   1. Oracle validation (compare passed accounts to cached
        //      vault_config.oracle_* with default-pubkey escape hatch).
        //   2. token_program.transfer_checked(depositor_usdc → vault_usdc, amount, decimals)
        //   3. CpiCall<6,8> for refresh_reserve, .invoke()
        //   4. Read kamino_reserve raw data at offsets 224..232 + 232..248
        //      via self.kamino_reserve.to_account_view().try_borrow()
        //      to compute Path-B total_assets_pre_deposit.
        //   5. CpiCall<12,16> for deposit_reserve_liquidity, .invoke_signed(&seeds)
        //   6. compute_shares_to_mint + slippage guard
        //   7. mint_family_shares + principal update + last_known_total_assets bump
        //   8. emit Deposited event
        //
        // For now, fail fast so the placeholder doesn't pretend to work.
        Err(ProgramError::Custom(u32::MAX))
    }
}
