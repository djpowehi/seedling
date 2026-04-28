use anchor_lang::prelude::*;

/// One global config per deployment. PDA at ["vault_config"].
///
/// `total_shares` and `last_known_total_assets` are the ERC-4626 accounting pair:
/// shares × last_known_total_assets gives the pool's USDC-equivalent value at
/// the last harvest. Mutated ONLY through `utils::harvest::harvest_and_fee` and
/// `mint_family_shares` / `burn_family_shares` to keep the invariant
/// `total_shares == sum(family_position.shares)` enforceable at the API boundary.
#[account]
pub struct VaultConfig {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub fee_bps: u16,

    pub kamino_reserve: Pubkey,
    pub usdc_mint: Pubkey,
    pub ctoken_mint: Pubkey,

    // Oracle pubkeys cached from reserve.config at init. Zero-pubkey = not configured
    // on this reserve. `refresh_reserve` CPI passes exactly these as the optional
    // oracle accounts.
    pub oracle_pyth: Pubkey,
    pub oracle_switchboard_price: Pubkey,
    pub oracle_switchboard_twap: Pubkey,
    pub oracle_scope_config: Pubkey,

    pub total_shares: u64,
    pub last_known_total_assets: u64,

    pub period_end_ts: i64,
    pub current_period_id: u32,

    /// Bonus-cycle length picked at vault init. Default 12 (annual "13th
    /// allowance"). Allowed values: 6 / 12 / 18 / 24 — semi-annual to
    /// biennial. Stored on-chain as documentation + so future rolls can
    /// auto-compute the next period end without a redeploy. The current
    /// `roll_period` still takes an explicit arg so admin can override
    /// for retakes / ops corrections; cycle_months is the canonical
    /// default the frontend renders ("annual 13th").
    pub cycle_months: u8,

    pub is_paused: bool,
    pub bump: u8,
}

impl VaultConfig {
    // 8  discriminator
    // 32 authority
    // 32 treasury
    // 2  fee_bps
    // 32 kamino_reserve
    // 32 usdc_mint
    // 32 ctoken_mint
    // 32 oracle_pyth
    // 32 oracle_switchboard_price
    // 32 oracle_switchboard_twap
    // 32 oracle_scope_config
    // 8  total_shares
    // 8  last_known_total_assets
    // 8  period_end_ts
    // 4  current_period_id
    // 1  cycle_months
    // 1  is_paused
    // 1  bump
    pub const LEN: usize =
        8 + 32 + 32 + 2 + 32 + 32 + 32 + 32 + 32 + 32 + 32 + 8 + 8 + 8 + 4 + 1 + 1 + 1;

    pub const SEED: &'static [u8] = b"vault_config";
}
