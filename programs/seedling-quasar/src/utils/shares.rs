use quasar_lang::prelude::*;

use crate::errors::SeedlingError;
use crate::state::{FamilyPosition, VaultConfig};

/// kvault pattern: ceiling on the denominator is the inflation-attack defense.
/// First depositor receives 1:1; subsequent deposits are diluted by the
/// pool's existing assets.
///
/// First-depositor donation-attack mitigation (Path A, locked Day 3 in
/// Anchor v1, preserved here): when total_shares == 0, callers MUST pass
/// total_assets_pre_deposit == 0. We enforce here so call sites get the
/// SeedlingError variant instead of an underflow surprise.
pub fn compute_shares_to_mint(
    amount: u64,
    total_shares: u64,
    total_assets_pre_deposit: u64,
) -> Result<u64, ProgramError> {
    if total_shares == 0 {
        // First depositor. If the vault has unclaimed assets, that's the
        // donation attack — refuse loudly.
        require!(total_assets_pre_deposit == 0, SeedlingError::InvalidAmount);
        return Ok(amount);
    }

    // shares = floor(amount × total_shares / max(1, total_assets_pre_deposit))
    let denominator = total_assets_pre_deposit.max(1);
    let shares = (amount as u128)
        .checked_mul(total_shares as u128)
        .ok_or(SeedlingError::Overflow)?
        .checked_div(denominator as u128)
        .ok_or(SeedlingError::DivisionByZero)?;
    u64::try_from(shares).map_err(|_| SeedlingError::Overflow.into())
}

/// Used by withdraw + distribute_*. Inverse of compute_shares_to_mint, with
/// floor rounding (favors the vault — user receives slightly less than
/// strictly-pro-rata, dust stays in the pool).
pub fn compute_assets_for_shares(
    shares_to_burn: u64,
    total_shares: u64,
    total_assets: u64,
) -> Result<u64, ProgramError> {
    require!(total_shares > 0, SeedlingError::InsufficientShares);
    let assets = (shares_to_burn as u128)
        .checked_mul(total_assets as u128)
        .ok_or(SeedlingError::Overflow)?
        .checked_div(total_shares as u128)
        .ok_or(SeedlingError::DivisionByZero)?;
    u64::try_from(assets).map_err(|_| SeedlingError::Overflow.into())
}

/// Inverse for monthly allowance: how many shares to burn to get N assets out.
/// Ceiling here so the user receives AT LEAST `target_assets` — kid getting
/// their allowance shouldn't be short-changed by a base unit. Vault still
/// benefits because it's burning slightly more shares than strictly-pro-rata.
pub fn compute_shares_for_assets(
    target_assets: u64,
    total_shares: u64,
    total_assets: u64,
) -> Result<u64, ProgramError> {
    require!(total_assets > 0, SeedlingError::InsufficientShares);
    // ceil(target_assets × total_shares / total_assets)
    let numerator = (target_assets as u128)
        .checked_mul(total_shares as u128)
        .ok_or(SeedlingError::Overflow)?;
    let shares = numerator
        .checked_add((total_assets as u128) - 1)
        .ok_or(SeedlingError::Overflow)?
        .checked_div(total_assets as u128)
        .ok_or(SeedlingError::DivisionByZero)?;
    u64::try_from(shares).map_err(|_| SeedlingError::Overflow.into())
}

/// THE ONLY way to mutate `family_position.shares` and `vault_config.total_shares`.
/// Both fields move by the same delta atomically — invariant
/// `total_shares == sum(family_position.shares)` holds by construction.
pub fn mint_family_shares(
    vault_config: &mut VaultConfig,
    family_position: &mut FamilyPosition,
    shares_to_mint: u64,
) -> Result<(), ProgramError> {
    let new_family = family_position
        .shares
        .get()
        .checked_add(shares_to_mint)
        .ok_or(SeedlingError::Overflow)?;
    let new_total = vault_config
        .total_shares
        .get()
        .checked_add(shares_to_mint)
        .ok_or(SeedlingError::Overflow)?;
    family_position.shares = new_family.into();
    vault_config.total_shares = new_total.into();
    Ok(())
}

pub fn burn_family_shares(
    vault_config: &mut VaultConfig,
    family_position: &mut FamilyPosition,
    shares_to_burn: u64,
) -> Result<(), ProgramError> {
    let cur = family_position.shares.get();
    require!(cur >= shares_to_burn, SeedlingError::InsufficientShares);
    let new_total = vault_config
        .total_shares
        .get()
        .checked_sub(shares_to_burn)
        .ok_or(SeedlingError::Underflow)?;
    family_position.shares = (cur - shares_to_burn).into();
    vault_config.total_shares = new_total.into();
    Ok(())
}
