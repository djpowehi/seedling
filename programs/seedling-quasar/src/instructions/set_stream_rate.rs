use quasar_lang::prelude::*;

use crate::errors::SeedlingError;
use crate::instructions::create_family::MAX_STREAM_RATE;
use crate::state::{FamilyPosition, VaultConfig};

/// Adjust the family's monthly stream_rate. Same authority model as
/// other parent-signed instructions (parent must sign, fee_payer
/// covers gas via the sponsor relay).
///
/// Bounds match `create_family`: rate > 0 and rate <= MAX_STREAM_RATE.
/// The next `distribute_monthly_allowance` will use the new rate; any
/// distribution already executed for the current cycle is unaffected.
#[derive(Accounts)]
#[instruction(new_stream_rate: u64)]
pub struct SetStreamRate {
    #[account(mut)]
    pub fee_payer: Signer,

    pub parent: Signer,

    #[account(
        mut,
        constraints(family_position.parent.eq(parent.address())) @ SeedlingError::InvalidAuthority,
    )]
    pub family_position: Account<FamilyPosition>,

    #[account(
        address = VaultConfig::seeds(),
        constraints(!vault_config.is_paused.get()) @ SeedlingError::VaultPaused,
    )]
    pub vault_config: Account<VaultConfig>,
}

impl SetStreamRate {
    pub fn handler(&mut self, new_stream_rate: u64) -> Result<(), ProgramError> {
        require!(new_stream_rate > 0, SeedlingError::InvalidStreamRate);
        require!(
            new_stream_rate <= MAX_STREAM_RATE,
            SeedlingError::InvalidStreamRate
        );

        self.family_position.stream_rate = new_stream_rate.into();
        Ok(())
    }
}
