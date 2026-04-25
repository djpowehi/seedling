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

/// Authority-only: bumps the bonus period forward. In production this runs
/// once per fiscal year (Dec 1 UTC or similar), incrementing
/// `current_period_id` so families can claim their next bonus. Also lets
/// authority shift `period_end_ts` for the upcoming period.
///
/// Mirrors `set_family_last_distribution`: not test-only, but usable in
/// tests as the canonical way to advance past a bonus gate.
#[derive(Accounts)]
pub struct RollPeriod<'info> {
    #[account(
        mut,
        seeds = [VaultConfig::SEED],
        bump = vault_config.bump,
        has_one = authority @ SeedlingError::InvalidAuthority,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    pub authority: Signer<'info>,
}

pub fn roll_period_handler(ctx: Context<RollPeriod>, next_period_end_ts: i64) -> Result<()> {
    let cfg = &mut ctx.accounts.vault_config;
    cfg.current_period_id = cfg
        .current_period_id
        .checked_add(1)
        .ok_or(SeedlingError::Overflow)?;
    cfg.period_end_ts = next_period_end_ts;
    Ok(())
}

/// Authority-only emergency pause / unpause. Flips `vault_config.is_paused`,
/// which is checked by every financial instruction's account constraint
/// (`constraint = !vault_config.is_paused @ SeedlingError::VaultPaused`).
///
/// When paused: deposit, withdraw, distribute_monthly_allowance, and
/// distribute_bonus all reject with VaultPaused. create_family also rejects
/// (no new families during incident response). Admin instructions
/// (set_family_last_distribution, roll_period, set_paused itself) remain
/// callable so authority can recover state.
#[derive(Accounts)]
pub struct SetPaused<'info> {
    #[account(
        mut,
        seeds = [VaultConfig::SEED],
        bump = vault_config.bump,
        has_one = authority @ SeedlingError::InvalidAuthority,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    pub authority: Signer<'info>,
}

pub fn set_paused_handler(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    ctx.accounts.vault_config.is_paused = paused;
    Ok(())
}
