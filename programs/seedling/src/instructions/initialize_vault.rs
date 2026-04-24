use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::errors::SeedlingError;
use crate::events::VaultInitialized;
use crate::state::VaultConfig;

pub const DEFAULT_FEE_BPS: u16 = 1_000; // 10%

#[derive(Accounts)]
#[instruction(args: InitializeVaultArgs)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = VaultConfig::LEN,
        seeds = [VaultConfig::SEED],
        bump,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    /// USDC mint. Its pubkey is cached on VaultConfig.usdc_mint; every later
    /// instruction validates against this.
    pub usdc_mint: InterfaceAccount<'info, Mint>,

    /// cUSDC (collateral) mint for the chosen Kamino reserve. Its pubkey is
    /// cached on VaultConfig.ctoken_mint. Reserve-agnostic: primary + backup
    /// reserves all work via the same program by caching their specific mints.
    pub ctoken_mint: InterfaceAccount<'info, Mint>,

    /// Treasury USDC account that receives the 10% protocol fee.
    /// CHECK: stored by pubkey only; no deserialization. Must be an ATA with
    /// matching mint in practice — validated by downstream fee-transfer CPIs.
    pub treasury_usdc_ata: UncheckedAccount<'info>,

    /// Kamino reserve we'll CPI into. Trusted config, set at init. Subsequent
    /// CPIs validate against vault_config.kamino_reserve.
    /// CHECK: stored by pubkey only at init. Downstream instructions require
    /// any Kamino account passed for deposit/redeem to match this pubkey.
    pub kamino_reserve: UncheckedAccount<'info>,

    /// Vault's USDC ATA. Owned by vault_config PDA; used as source on
    /// deposit-to-Kamino and destination on redeem-from-Kamino.
    #[account(
        init,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_config,
        associated_token::token_program = token_program,
    )]
    pub vault_usdc_ata: InterfaceAccount<'info, TokenAccount>,

    /// Vault's cUSDC ATA. Owned by vault_config PDA; holds Kamino collateral.
    #[account(
        init,
        payer = authority,
        associated_token::mint = ctoken_mint,
        associated_token::authority = vault_config,
        associated_token::token_program = token_program,
    )]
    pub vault_ctoken_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeVaultArgs {
    /// Pyth oracle configured for this reserve. Pubkey::default() = not used.
    pub oracle_pyth: Pubkey,
    /// Switchboard price oracle. Pubkey::default() = not used.
    pub oracle_switchboard_price: Pubkey,
    /// Switchboard TWAP oracle. Pubkey::default() = not used.
    pub oracle_switchboard_twap: Pubkey,
    /// Scope oracle config. Pubkey::default() = not used.
    pub oracle_scope_config: Pubkey,
    /// Unix timestamp when the current bonus period ends (e.g. Dec 1 2026 UTC).
    pub period_end_ts: i64,
    /// Protocol fee in basis points. Pass 1000 for the 10% default.
    pub fee_bps: u16,
}

pub fn initialize_vault_handler(
    ctx: Context<InitializeVault>,
    args: InitializeVaultArgs,
) -> Result<()> {
    require!(args.fee_bps <= 10_000, SeedlingError::InvalidAmount);

    let cfg = &mut ctx.accounts.vault_config;
    cfg.authority = ctx.accounts.authority.key();
    cfg.treasury = ctx.accounts.treasury_usdc_ata.key();
    cfg.fee_bps = args.fee_bps;
    cfg.kamino_reserve = ctx.accounts.kamino_reserve.key();
    cfg.usdc_mint = ctx.accounts.usdc_mint.key();
    cfg.ctoken_mint = ctx.accounts.ctoken_mint.key();
    cfg.oracle_pyth = args.oracle_pyth;
    cfg.oracle_switchboard_price = args.oracle_switchboard_price;
    cfg.oracle_switchboard_twap = args.oracle_switchboard_twap;
    cfg.oracle_scope_config = args.oracle_scope_config;
    cfg.total_shares = 0;
    cfg.last_known_total_assets = 0;
    cfg.period_end_ts = args.period_end_ts;
    cfg.current_period_id = 0;
    cfg.is_paused = false;
    cfg.bump = ctx.bumps.vault_config;

    emit!(VaultInitialized {
        authority: cfg.authority,
        treasury: cfg.treasury,
        kamino_reserve: cfg.kamino_reserve,
        usdc_mint: cfg.usdc_mint,
        ctoken_mint: cfg.ctoken_mint,
        ts: Clock::get()?.unix_timestamp,
    });

    Ok(())
}
