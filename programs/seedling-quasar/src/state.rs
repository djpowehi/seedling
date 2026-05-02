use quasar_lang::prelude::*;

/// Raw seed bytes for VaultConfig PDA. Quasar's `#[seeds(b"vault_config")]`
/// bakes this into the auto-generated `VaultConfig::seeds()` helper but
/// doesn't expose it as a const. We need the literal for PDA-signed CPI
/// where we hand the bytes to `Seed::from(...)`. Single source of truth.
pub const VAULT_CONFIG_SEED: &[u8] = b"vault_config";

/// One global config per deployment. PDA at ["vault_config"].
///
/// `total_shares` and `last_known_total_assets` are the ERC-4626 accounting pair:
/// shares × last_known_total_assets gives the pool's USDC-equivalent value at
/// the last harvest. Mutated ONLY through `utils::harvest::harvest_and_fee` and
/// `mint_family_shares` / `burn_family_shares` to keep the invariant
/// `total_shares == sum(family_position.shares)` enforceable at the API boundary.
#[account(discriminator = 1, set_inner)]
#[seeds(b"vault_config")]
pub struct VaultConfig {
    pub authority: Address,
    pub treasury: Address,
    pub fee_bps: u16,

    pub kamino_reserve: Address,
    pub usdc_mint: Address,
    pub ctoken_mint: Address,

    // Oracle pubkeys cached from reserve.config at init. Zero-address = not
    // configured on this reserve. `refresh_reserve` CPI passes exactly these
    // as the optional oracle accounts.
    pub oracle_pyth: Address,
    pub oracle_switchboard_price: Address,
    pub oracle_switchboard_twap: Address,
    pub oracle_scope_config: Address,

    pub total_shares: u64,
    pub last_known_total_assets: u64,

    pub period_end_ts: i64,
    pub current_period_id: u32,

    pub is_paused: bool,
    pub bump: u8,
}

/// Per parent-kid pair. PDA at ["family", parent, kid].
///
/// `shares` is mutated ONLY through utils::harvest::mint_family_shares /
/// burn_family_shares which atomically update VaultConfig.total_shares by
/// the same delta. Direct mutation is a footgun — use the helpers.
#[account(discriminator = 2, set_inner)]
#[seeds(b"family", parent: Address, kid: Address)]
pub struct FamilyPosition {
    pub parent: Address,
    pub kid: Address,

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

/// Read-only PDA derived for the kid so the kid-facing URL has a canonical,
/// shareable address. Kid never signs in v1.
#[account(discriminator = 3, set_inner)]
#[seeds(b"kid", parent: Address, kid: Address)]
pub struct KidView {
    pub family_position: Address,
    pub bump: u8,
}
