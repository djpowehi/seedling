use quasar_lang::prelude::*;
use quasar_spl::prelude::*;

use crate::errors::SeedlingError;
use crate::state::{VaultConfig, VaultConfigInner};

pub const DEFAULT_FEE_BPS: u16 = 2_500; // 25% (was 10% in Anchor v1)
pub const MAX_FEE_BPS: u16 = 10_000;

#[derive(Copy, Clone, QuasarSerialize)]
pub struct InitializeVaultArgs {
    pub oracle_pyth: Address,
    pub oracle_switchboard_price: Address,
    pub oracle_switchboard_twap: Address,
    pub oracle_scope_config: Address,
    pub period_end_ts: i64,
    pub fee_bps: u16,
}

#[derive(Accounts)]
pub struct InitializeVault {
    #[account(mut)]
    pub authority: Signer,

    #[account(mut, init, payer = authority, address = VaultConfig::seeds())]
    pub vault_config: Account<VaultConfig>,

    /// USDC mint. Pubkey cached on VaultConfig.usdc_mint; subsequent
    /// instructions validate against this.
    pub usdc_mint: InterfaceAccount<Mint>,

    /// cUSDC (collateral) mint for the chosen Kamino reserve. Pubkey cached
    /// on VaultConfig.ctoken_mint. Reserve-agnostic: switching reserves means
    /// re-init with new mints.
    pub ctoken_mint: InterfaceAccount<Mint>,

    /// Treasury USDC ATA receiving the protocol fee. Stored by pubkey only;
    /// downstream fee-transfer CPIs validate mint+owner at use.
    pub treasury_usdc_ata: UncheckedAccount,

    /// Kamino reserve. Trusted config, set at init. Subsequent CPIs validate
    /// every klend account passed against vault_config.kamino_reserve.
    pub kamino_reserve: UncheckedAccount,

    /// Vault USDC ATA — owned by vault_config PDA, source on Kamino deposit
    /// and destination on redeem.
    #[account(mut, init, payer = authority,
        associated_token(
            authority = vault_config,
            mint = usdc_mint,
            token_program = token_program,
            system_program = system_program,
            ata_program = associated_token_program,
        ),
    )]
    pub vault_usdc_ata: InterfaceAccount<Token>,

    /// Vault cUSDC ATA — owned by vault_config PDA, holds Kamino collateral.
    #[account(mut, init, payer = authority,
        associated_token(
            authority = vault_config,
            mint = ctoken_mint,
            token_program = token_program,
            system_program = system_program,
            ata_program = associated_token_program,
        ),
    )]
    pub vault_ctoken_ata: InterfaceAccount<Token>,

    pub token_program: Interface<TokenInterface>,
    pub associated_token_program: Program<AssociatedTokenProgram>,
    pub system_program: Program<SystemProgram>,
}

impl InitializeVault {
    #[inline(always)]
    pub fn handler(
        &mut self,
        args: InitializeVaultArgs,
        bumps: &InitializeVaultBumps,
    ) -> Result<(), ProgramError> {
        require!(args.fee_bps <= MAX_FEE_BPS, SeedlingError::InvalidAmount);

        self.vault_config.set_inner(VaultConfigInner {
            authority: *self.authority.address(),
            treasury: *self.treasury_usdc_ata.address(),
            fee_bps: args.fee_bps,
            kamino_reserve: *self.kamino_reserve.address(),
            usdc_mint: *self.usdc_mint.address(),
            ctoken_mint: *self.ctoken_mint.address(),
            oracle_pyth: args.oracle_pyth,
            oracle_switchboard_price: args.oracle_switchboard_price,
            oracle_switchboard_twap: args.oracle_switchboard_twap,
            oracle_scope_config: args.oracle_scope_config,
            total_shares: 0,
            last_known_total_assets: 0,
            period_end_ts: args.period_end_ts,
            current_period_id: 0,
            is_paused: false,
            bump: bumps.vault_config,
        });

        Ok(())
    }
}
