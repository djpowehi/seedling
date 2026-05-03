use quasar_lang::prelude::*;

#[error_code]
pub enum SeedlingError {
    Overflow,
    Underflow,
    DivisionByZero,
    InvalidAmount,
    InvalidAuthority,
    InvalidStreamRate,
    MintMismatch,
    ReserveMismatch,
    VaultPaused,
    InsufficientShares,
    SlippageExceeded,
    DistributionTooEarly,
    TooEarly,
    BonusPeriodNotEnded,
    BonusAlreadyPaid,
    PeriodNotEnded,
    NoYieldAccrued,
    AlreadyDistributedForPeriod,
    FamilyNotEmpty,
    InvalidKaminoAccount,
    InvalidOracle,
    BelowDustThreshold,
}
