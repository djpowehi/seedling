use quasar_lang::prelude::*;
use quasar_spl::{Mint, Token, TokenInterface};

use crate::errors::SeedlingError;
use crate::state::VaultConfig;

pub const DEFAULT_FEE_BPS: u16 = 2_500; // 25% (was 10% in Anchor v1)
pub const MAX_FEE_BPS: u16 = 10_000;

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: &'info mut Signer,

    #[account(
        init,
        payer = authority,
        seeds = [VaultConfig::SEED],
        bump,
    )]
    pub vault_config: &'info mut Account<VaultConfig>,

    /// USDC mint. Pubkey cached on VaultConfig.usdc_mint; subsequent
    /// instructions validate against this.
    pub usdc_mint: &'info Account<Mint>,

    /// cUSDC (collateral) mint for the chosen Kamino reserve. Pubkey cached
    /// on VaultConfig.ctoken_mint. Reserve-agnostic: switching reserves means
    /// re-init with new mints.
    pub ctoken_mint: &'info Account<Mint>,

    /// Treasury USDC ATA receiving the protocol fee. Stored by pubkey only;
    /// downstream fee-transfer CPIs validate mint+owner at use.
    pub treasury_usdc_ata: &'info UncheckedAccount,

    /// Kamino reserve. Trusted config, set at init. Subsequent CPIs validate
    /// every klend account passed against vault_config.kamino_reserve.
    pub kamino_reserve: &'info UncheckedAccount,

    /// Vault USDC ATA — owned by vault_config PDA, source on Kamino deposit
    /// and destination on redeem.
    #[account(
        init,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_config,
        associated_token::token_program = token_program,
    )]
    pub vault_usdc_ata: &'info mut Account<Token>,

    /// Vault cUSDC ATA — owned by vault_config PDA, holds Kamino collateral.
    #[account(
        init,
        payer = authority,
        associated_token::mint = ctoken_mint,
        associated_token::authority = vault_config,
        associated_token::token_program = token_program,
    )]
    pub vault_ctoken_ata: &'info mut Account<Token>,

    pub token_program: &'info Program<TokenInterface>,
    pub associated_token_program: &'info Program<AssociatedTokenProgram>,
    pub system_program: &'info Program<System>,
}

#[derive(Pod, Zeroable, Copy, Clone)]
#[repr(C)]
pub struct InitializeVaultArgs {
    pub oracle_pyth: Address,
    pub oracle_switchboard_price: Address,
    pub oracle_switchboard_twap: Address,
    pub oracle_scope_config: Address,
    pub period_end_ts: i64,
    pub fee_bps: u16,
    pub _padding: [u8; 6],
}

impl<'info> InitializeVault<'info> {
    #[inline(always)]
    pub fn handler(
        &mut self,
        args: InitializeVaultArgs,
        bumps: &InitializeVaultBumps,
    ) -> Result<(), ProgramError> {
        require!(args.fee_bps <= MAX_FEE_BPS, SeedlingError::InvalidAmount);

        let cfg = &mut self.vault_config;
        cfg.authority = *self.authority.address();
        cfg.treasury = *self.treasury_usdc_ata.address();
        cfg.fee_bps = args.fee_bps;
        cfg.kamino_reserve = *self.kamino_reserve.address();
        cfg.usdc_mint = *self.usdc_mint.address();
        cfg.ctoken_mint = *self.ctoken_mint.address();
        cfg.oracle_pyth = args.oracle_pyth;
        cfg.oracle_switchboard_price = args.oracle_switchboard_price;
        cfg.oracle_switchboard_twap = args.oracle_switchboard_twap;
        cfg.oracle_scope_config = args.oracle_scope_config;
        cfg.total_shares = 0;
        cfg.last_known_total_assets = 0;
        cfg.period_end_ts = args.period_end_ts;
        cfg.current_period_id = 0;
        cfg.is_paused = false;
        cfg.bump = bumps.vault_config;

        Ok(())
    }
}
