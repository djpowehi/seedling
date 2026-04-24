use anchor_lang::prelude::*;

#[event]
pub struct VaultInitialized {
    pub authority: Pubkey,
    pub treasury: Pubkey,
    pub kamino_reserve: Pubkey,
    pub usdc_mint: Pubkey,
    pub ctoken_mint: Pubkey,
    pub ts: i64,
}

#[event]
pub struct FamilyCreated {
    pub family: Pubkey,
    pub parent: Pubkey,
    pub kid: Pubkey,
    pub stream_rate: u64,
    pub ts: i64,
}

#[event]
pub struct Deposited {
    pub family: Pubkey,
    pub parent: Pubkey,
    pub amount: u64,
    pub shares_minted: u64,
    pub fee_to_treasury: u64,
    pub ts: i64,
}

#[event]
pub struct MonthlyAllowanceDistributed {
    pub family: Pubkey,
    pub kid: Pubkey,
    pub stream_rate: u64,
    pub principal_drawdown: u64,
    pub yield_drawdown: u64,
    pub fee_to_treasury: u64,
    pub ts: i64,
}

#[event]
pub struct BonusDistributed {
    pub family: Pubkey,
    pub kid: Pubkey,
    pub amount: u64,
    pub fee_to_treasury: u64,
    pub period_id: u32,
    pub ts: i64,
}

#[event]
pub struct Withdrawn {
    pub family: Pubkey,
    pub parent: Pubkey,
    pub shares_burned: u64,
    pub assets_out: u64,
    pub principal_drawdown: u64,
    pub yield_drawdown: u64,
    pub fee_to_treasury: u64,
    pub ts: i64,
}
