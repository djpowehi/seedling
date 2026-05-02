use quasar_lang::prelude::*;

use crate::errors::SeedlingError;
use crate::state::{FamilyPosition, VaultConfig};

/// Authority-only override for `family_position.last_distribution`.
///
/// Legitimate use cases:
///   1. Ops correction: keeper ran distribute at the wrong moment; rewind
///      so the next 30-day gate lands correctly.
///   2. Tests: backdate to simulate "30 days elapsed" without waiting slots.
///
/// Real admin tool, not feature-flagged. Authority gate prevents abuse.
#[derive(Accounts)]
pub struct SetFamilyLastDistribution {
    #[account(
        address = VaultConfig::seeds(),
        has_one(authority) @ SeedlingError::InvalidAuthority,
    )]
    pub vault_config: Account<VaultConfig>,

    #[account(mut)]
    pub family_position: Account<FamilyPosition>,

    pub authority: Signer,
}

impl SetFamilyLastDistribution {
    #[inline(always)]
    pub fn handler(&mut self, new_last_distribution: i64) -> Result<(), ProgramError> {
        self.family_position.last_distribution = new_last_distribution.into();
        Ok(())
    }
}

/// Authority-only: bumps the bonus period forward. In production this runs
/// once per fiscal year (Dec 1 UTC or similar), incrementing
/// `current_period_id` so families can claim their next bonus.
#[derive(Accounts)]
pub struct RollPeriod {
    #[account(
        mut,
        address = VaultConfig::seeds(),
        has_one(authority) @ SeedlingError::InvalidAuthority,
    )]
    pub vault_config: Account<VaultConfig>,

    pub authority: Signer,
}

impl RollPeriod {
    #[inline(always)]
    pub fn handler(&mut self, next_period_end_ts: i64) -> Result<(), ProgramError> {
        let new_id = self
            .vault_config
            .current_period_id
            .get()
            .checked_add(1)
            .ok_or(SeedlingError::Overflow)?;
        self.vault_config.current_period_id = new_id.into();
        self.vault_config.period_end_ts = next_period_end_ts.into();
        Ok(())
    }
}

/// Authority-only emergency pause / unpause. Every financial instruction
/// checks `!vault_config.is_paused`. Admin instructions remain callable so
/// authority can recover state during an incident.
#[derive(Accounts)]
pub struct SetPaused {
    #[account(
        mut,
        address = VaultConfig::seeds(),
        has_one(authority) @ SeedlingError::InvalidAuthority,
    )]
    pub vault_config: Account<VaultConfig>,

    pub authority: Signer,
}

impl SetPaused {
    #[inline(always)]
    pub fn handler(&mut self, paused: bool) -> Result<(), ProgramError> {
        self.vault_config.is_paused = paused.into();
        Ok(())
    }
}
