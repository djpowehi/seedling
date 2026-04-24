use anchor_lang::prelude::*;

use crate::errors::SeedlingError;
use crate::events::FamilyCreated;
use crate::state::{FamilyPosition, KidView, VaultConfig};

/// $1000/month in base units (USDC has 6 decimals). Sanity cap, not an
/// economic ceiling — adjust in a follow-up if real families want more.
pub const MAX_STREAM_RATE: u64 = 1_000 * 1_000_000;

#[derive(Accounts)]
#[instruction(kid: Pubkey, stream_rate: u64)]
pub struct CreateFamily<'info> {
    #[account(mut)]
    pub parent: Signer<'info>,

    #[account(
        seeds = [VaultConfig::SEED],
        bump = vault_config.bump,
        constraint = !vault_config.is_paused @ SeedlingError::VaultPaused,
    )]
    pub vault_config: Account<'info, VaultConfig>,

    #[account(
        init,
        payer = parent,
        space = FamilyPosition::LEN,
        seeds = [FamilyPosition::SEED_PREFIX, parent.key().as_ref(), kid.as_ref()],
        bump,
    )]
    pub family_position: Account<'info, FamilyPosition>,

    #[account(
        init,
        payer = parent,
        space = KidView::LEN,
        seeds = [KidView::SEED_PREFIX, parent.key().as_ref(), kid.as_ref()],
        bump,
    )]
    pub kid_view: Account<'info, KidView>,

    pub system_program: Program<'info, System>,
}

pub fn create_family_handler(
    ctx: Context<CreateFamily>,
    kid: Pubkey,
    stream_rate: u64,
) -> Result<()> {
    require!(stream_rate > 0, SeedlingError::InvalidStreamRate);
    require!(
        stream_rate <= MAX_STREAM_RATE,
        SeedlingError::InvalidStreamRate
    );

    let now = Clock::get()?.unix_timestamp;

    let family = &mut ctx.accounts.family_position;
    family.parent = ctx.accounts.parent.key();
    family.kid = kid;
    family.shares = 0;
    family.principal_deposited = 0;
    family.principal_remaining = 0;
    family.stream_rate = stream_rate;
    family.created_at = now;
    // Seed last_distribution to now so the first monthly allowance cannot fire
    // until +30 days. Without this, create_family immediately followed by
    // distribute_monthly_allowance would drain a month's stream on day one.
    family.last_distribution = now;
    family.last_bonus_period_id = 0;
    family.total_yield_earned = 0;
    family.bump = ctx.bumps.family_position;

    let kid_view = &mut ctx.accounts.kid_view;
    kid_view.family_position = family.key();
    kid_view.bump = ctx.bumps.kid_view;

    emit!(FamilyCreated {
        family: family.key(),
        parent: family.parent,
        kid: family.kid,
        stream_rate,
        ts: now,
    });

    Ok(())
}
