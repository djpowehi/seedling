use quasar_lang::prelude::*;

// Quasar requires explicit event discriminators (no implicit hashing).
// Numbers chosen to match insertion order in the Anchor v1 events file.

#[event(discriminator = 0)]
pub struct VaultInitialized {
    pub authority: Address,
    pub treasury: Address,
    pub kamino_reserve: Address,
    pub usdc_mint: Address,
    pub ctoken_mint: Address,
    pub ts: i64,
}

#[event(discriminator = 1)]
pub struct FamilyCreated {
    pub family: Address,
    pub parent: Address,
    pub kid: Address,
    pub stream_rate: u64,
    pub ts: i64,
}

#[event(discriminator = 2)]
pub struct Deposited {
    pub family: Address,
    /// Whoever signed the deposit. May be the family's parent (top-up) or
    /// any other wallet (gift). Off-chain consumers compare to
    /// family_position.parent to distinguish.
    pub depositor: Address,
    pub amount: u64,
    pub shares_minted: u64,
    pub fee_to_treasury: u64,
    pub ts: i64,
}

#[event(discriminator = 3)]
pub struct Withdrawn {
    pub family: Address,
    pub parent: Address,
    pub shares_burned: u64,
    pub assets_out: u64,
    pub principal_drawdown: u64,
    pub yield_drawdown: u64,
    pub fee_to_treasury: u64,
    pub ts: i64,
}
