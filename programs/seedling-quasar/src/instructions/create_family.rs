use quasar_lang::prelude::*;
use quasar_lang::sysvars::Sysvar as _;

use crate::errors::SeedlingError;
use crate::state::{FamilyPosition, FamilyPositionInner, KidView, KidViewInner, VaultConfig};

/// $1000/month in base units (USDC has 6 decimals). Sanity cap, not an
/// economic ceiling — adjust in a follow-up if real families want more.
pub const MAX_STREAM_RATE: u64 = 1_000 * 1_000_000;

#[derive(Accounts)]
#[instruction(kid: Address, stream_rate: u64)]
pub struct CreateFamily {
    #[account(mut)]
    pub parent: Signer,

    #[account(
        address = VaultConfig::seeds(),
        constraints(!vault_config.is_paused.get()) @ SeedlingError::VaultPaused,
    )]
    pub vault_config: Account<VaultConfig>,

    #[account(
        mut,
        init,
        payer = parent,
        address = FamilyPosition::seeds(parent.address(), &kid),
    )]
    pub family_position: Account<FamilyPosition>,

    #[account(
        mut,
        init,
        payer = parent,
        address = KidView::seeds(parent.address(), &kid),
    )]
    pub kid_view: Account<KidView>,

    pub system_program: Program<SystemProgram>,
}

impl CreateFamily {
    #[inline(always)]
    pub fn handler(
        &mut self,
        kid: Address,
        stream_rate: u64,
        bumps: &CreateFamilyBumps,
    ) -> Result<(), ProgramError> {
        require!(stream_rate > 0, SeedlingError::InvalidStreamRate);
        require!(
            stream_rate <= MAX_STREAM_RATE,
            SeedlingError::InvalidStreamRate
        );

        let now = Clock::get()?.unix_timestamp.get();

        self.family_position.set_inner(FamilyPositionInner {
            parent: *self.parent.address(),
            kid,
            shares: 0,
            principal_deposited: 0,
            principal_remaining: 0,
            stream_rate,
            created_at: now,
            // Seed last_distribution to now so the first monthly allowance
            // cannot fire until +30 days. Without this, create_family
            // immediately followed by distribute_monthly_allowance would
            // drain a month's stream on day one.
            last_distribution: now,
            last_bonus_period_id: 0,
            total_yield_earned: 0,
            bump: bumps.family_position,
        });

        self.kid_view.set_inner(KidViewInner {
            family_position: *self.family_position.address(),
            bump: bumps.kid_view,
        });

        Ok(())
    }
}
