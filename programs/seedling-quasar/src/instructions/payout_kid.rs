use quasar_lang::prelude::*;
use quasar_spl::prelude::*;

use crate::errors::SeedlingError;
use crate::state::{FamilyPosition, VaultConfig, FAMILY_SEED};

/// Pay USDC out of the family-PDA-owned `kid_pool_ata` to a parent's USDC
/// ATA. The destination MUST be the parent's own USDC ATA — chaining
/// to 4P or any other wallet is the parent's responsibility, done as a
/// follow-on SPL transfer in the same client tx.
///
/// Authority model:
///   - parent signs (intent)
///   - family_position PDA signs (releases USDC; it's the kid_pool_ata
///     authority because the ATA was created with family_position as
///     the owner)
///   - fee_payer covers gas (sponsor relay path)
///
/// The kid is purely an identifier — they don't sign, they don't have
/// a key. The family vault custodies funds; parent triggers payout.
#[derive(Accounts)]
#[instruction(amount: u64)]
pub struct PayoutKid {
    #[account(mut)]
    pub fee_payer: Signer,

    pub parent: Signer,

    #[account(
        constraints(family_position.parent.eq(parent.address())) @ SeedlingError::InvalidAuthority,
    )]
    pub family_position: Account<FamilyPosition>,

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

    /// Destination = parent's own USDC ATA. We constrain ownership so a
    /// rogue caller can't redirect kid funds to an attacker — even if
    /// the parent's signature gets phished, the only place USDC can go
    /// is back to the parent's wallet.
    #[account(
        mut,
        constraints(
            destination_ata.owner.eq(parent.address())
        ) @ SeedlingError::InvalidAuthority,
        constraints(
            destination_ata.mint.eq(&vault_config.usdc_mint)
        ) @ SeedlingError::MintMismatch,
    )]
    pub destination_ata: InterfaceAccount<Token>,

    #[account(
        address = VaultConfig::seeds(),
        constraints(!vault_config.is_paused.get()) @ SeedlingError::VaultPaused,
    )]
    pub vault_config: Account<VaultConfig>,

    #[account(
        constraints(usdc_mint.address().eq(&vault_config.usdc_mint)) @ SeedlingError::MintMismatch,
    )]
    pub usdc_mint: InterfaceAccount<Mint>,

    pub token_program: Interface<TokenInterface>,
}

impl PayoutKid {
    pub fn handler(&mut self, amount: u64) -> Result<(), ProgramError> {
        require!(amount > 0, SeedlingError::InvalidAmount);

        let kid_balance = self.kid_pool_ata.amount.get();
        require!(kid_balance >= amount, SeedlingError::InsufficientFunds);

        // Sign as family_position PDA — that's the kid_pool_ata's authority.
        // Seeds: ["family_v3", parent_addr, kid_addr, bump]
        let parent_addr = self.family_position.parent;
        let kid_addr = self.family_position.kid;
        let bump_seed = [self.family_position.bump];
        let signer_seeds = [
            Seed::from(FAMILY_SEED),
            Seed::from(parent_addr.as_ref()),
            Seed::from(kid_addr.as_ref()),
            Seed::from(&bump_seed),
        ];

        self.token_program
            .transfer_checked(
                &self.kid_pool_ata,
                &self.usdc_mint,
                &self.destination_ata,
                &self.family_position,
                amount,
                self.usdc_mint.decimals,
            )
            .invoke_signed(&signer_seeds)?;

        Ok(())
    }
}
