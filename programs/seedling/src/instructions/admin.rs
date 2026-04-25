use anchor_lang::prelude::*;

use crate::errors::SeedlingError;
use crate::state::{FamilyPosition, VaultConfig};

/// Authority-only override for `family_position.last_distribution`. Legitimate
/// use cases:
///   1. Ops correction: keeper ran a distribute at the wrong moment, need to
///      rewind the clock to make the next 30-day gate land correctly.
///   2. Tests: backdate the field to simulate "30 days elapsed" without
///      waiting real slots.
///
/// Not a test-only feature-flagged instruction — it's a real admin tool. The
/// authority gate prevents abuse; parents cannot move their own gate.
#[derive(Accounts)]
pub struct SetFamilyLastDistribution<'info> {
    #[account(
        seeds = [VaultConfig::SEED],
        bump = vault_config.bump,
        has_one = authority @ SeedlingError::InvalidAuthority,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(mut)]
    pub family_position: Account<'info, FamilyPosition>,

    pub authority: Signer<'info>,
}

pub fn set_family_last_distribution_handler(
    ctx: Context<SetFamilyLastDistribution>,
    new_last_distribution: i64,
) -> Result<()> {
    ctx.accounts.family_position.last_distribution = new_last_distribution;
    Ok(())
}
