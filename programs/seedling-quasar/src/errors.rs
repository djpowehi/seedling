use quasar_lang::prelude::*;

#[error_code]
pub enum SeedlingError {
    Overflow,
    Underflow,
    DivisionByZero,
    InvalidAmount,
    InvalidAuthority,
    MintMismatch,
    ReserveMismatch,
    VaultPaused,
    InsufficientShares,
    SlippageExceeded,
    DistributionTooEarly,
    PeriodNotEnded,
    NoYieldAccrued,
    AlreadyDistributedForPeriod,
    FamilyNotEmpty,
    InvalidKaminoAccount,
    InvalidOracle,
}
