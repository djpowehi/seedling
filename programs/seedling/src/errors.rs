use anchor_lang::prelude::*;

#[error_code]
pub enum SeedlingError {
    #[msg("Vault is paused")]
    VaultPaused,

    #[msg("Too early: 30-day monthly gate has not elapsed")]
    TooEarly,

    #[msg("Bonus already paid for this period")]
    BonusAlreadyPaid,

    #[msg("Bonus period not yet ended")]
    BonusPeriodNotEnded,

    #[msg("Slippage exceeded")]
    SlippageExceeded,

    #[msg("Insufficient shares")]
    InsufficientShares,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Arithmetic underflow")]
    Underflow,

    #[msg("Division by zero")]
    DivisionByZero,

    #[msg("Invalid authority for this operation")]
    InvalidAuthority,

    #[msg("Invalid stream rate: must be > 0 and <= MAX_STREAM_RATE")]
    InvalidStreamRate,

    #[msg("Invalid deposit amount: must be > 0")]
    InvalidAmount,

    #[msg("Reserve account does not match cached VaultConfig.kamino_reserve")]
    ReserveMismatch,

    #[msg("Mint account does not match cached VaultConfig mint")]
    MintMismatch,

    #[msg("Oracle account does not match cached VaultConfig oracle")]
    OracleMismatch,

    #[msg("Amount below dust threshold")]
    BelowDustThreshold,

    #[msg("Invariant violation: total_shares != sum(family_position.shares)")]
    SharesInvariantViolation,

    #[msg("Invariant violation: principal over-withdrawn")]
    PrincipalInvariantViolation,

    #[msg("Kamino CPI failed")]
    KaminoCpiFailed,
}
