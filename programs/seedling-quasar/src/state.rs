use quasar_lang::prelude::*;

/// Raw seed bytes for VaultConfig PDA. Quasar's `#[seeds(b"vault_config_v2")]`
/// bakes this into the auto-generated `VaultConfig::seeds()` helper but
/// doesn't expose it as a const. We need the literal for PDA-signed CPI
/// where we hand the bytes to `Seed::from(...)`. Single source of truth.
pub const VAULT_CONFIG_SEED: &[u8] = b"vault_config_v2";

/// Raw seed bytes for FamilyPosition PDA — used by `payout_kid` to sign
/// transfers from the family-PDA-owned `kid_pool_ata`. Mirror of the
/// `#[seeds(b"family_v3", ...)]` declaration on the FamilyPosition struct.
pub const FAMILY_SEED: &[u8] = b"family_v3";

/// One global config per deployment. PDA at ["vault_config_v2"].
///
/// `total_shares` and `last_known_total_assets` are the ERC-4626 accounting pair:
/// shares × last_known_total_assets gives the pool's USDC-equivalent value at
/// the last harvest. Mutated ONLY through `utils::harvest::harvest_and_fee` and
/// `mint_family_shares` / `burn_family_shares` to keep the invariant
/// `total_shares == sum(family_position.shares)` enforceable at the API boundary.
#[account(discriminator = 1, set_inner)]
#[seeds(b"vault_config_v2")]
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

/// Per parent-kid pair. PDA at ["family_v3", parent, kid].
///
/// `shares` is mutated ONLY through utils::harvest::mint_family_shares /
/// burn_family_shares which atomically update VaultConfig.total_shares by
/// the same delta. Direct mutation is a footgun — use the helpers.
///
/// `kid` is no longer a wallet pubkey. It's a 32-byte identifier the
/// parent generates client-side at family creation, used purely as a
/// PDA seed. The kid never holds a key — the family vault custodies
/// their USDC via a PDA-owned token account (see distribute_*.rs).
///
/// v3 seed: cuts over from the v2 layout where `kid` was a real wallet
/// pubkey owning the kid's USDC ATA. v2 PDAs are abandoned; v3 PDAs are
/// fresh under the parent-custody model.
#[account(discriminator = 2, set_inner)]
#[seeds(b"family_v3", parent: Address, kid: Address)]
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
/// shareable address. Kid never signs.
///
/// v3 seed: paired with family_v3 above.
#[account(discriminator = 3, set_inner)]
#[seeds(b"kid_v3", parent: Address, kid: Address)]
pub struct KidView {
    pub family_position: Address,
    pub bump: u8,
}
