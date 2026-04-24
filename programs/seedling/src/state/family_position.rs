use anchor_lang::prelude::*;

/// Per parent-kid pair. PDA at ["family", parent, kid].
///
/// `shares` is mutated ONLY through `utils::harvest::mint_family_shares` /
/// `burn_family_shares` which atomically update `VaultConfig.total_shares` by
/// the same delta. Direct mutation is a footgun — use the helpers.
///
/// `principal_remaining` decreases on monthly allowance (principal-first
/// drawdown: min(stream_rate, principal_remaining)) and on withdraw.
/// Bonus calculation is `max(0, family_assets - principal_remaining)` which
/// by construction represents pure yield.
///
/// `last_distribution` is seeded to `created_at` in `create_family` so the
/// first monthly allowance cannot fire until 30 days after onboarding. This
/// prevents the day-1 drain attack.
#[account]
pub struct FamilyPosition {
    pub parent: Pubkey,
    pub kid: Pubkey,

    pub shares: u64,
    pub principal_deposited: u64,
    pub principal_remaining: u64,

    pub stream_rate: u64,

    pub created_at: i64,
    pub last_distribution: i64,
    pub last_bonus_period_id: u32,

    pub total_yield_earned: u64,

    pub bump: u8,
}

impl FamilyPosition {
    // 8  discriminator
    // 32 parent
    // 32 kid
    // 8  shares
    // 8  principal_deposited
    // 8  principal_remaining
    // 8  stream_rate
    // 8  created_at
    // 8  last_distribution
    // 4  last_bonus_period_id
    // 8  total_yield_earned
    // 1  bump
    pub const LEN: usize = 8 + 32 + 32 + 8 + 8 + 8 + 8 + 8 + 8 + 4 + 8 + 1;

    pub const SEED_PREFIX: &'static [u8] = b"family";
}

/// Read-only PDA derived for the kid so the kid-facing URL has a canonical,
/// shareable address. Kid never signs in v1.
#[account]
pub struct KidView {
    pub family_position: Pubkey,
    pub bump: u8,
}

impl KidView {
    // 8 discriminator + 32 family_position + 1 bump
    pub const LEN: usize = 8 + 32 + 1;

    pub const SEED_PREFIX: &'static [u8] = b"kid";
}
