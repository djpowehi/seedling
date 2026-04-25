use anchor_lang::prelude::*;

use crate::errors::SeedlingError;
use crate::state::{FamilyPosition, VaultConfig};

/// kvault pattern: ceiling on the denominator is the inflation-attack defense.
/// First depositor receives 1:1; subsequent deposits are diluted by the
/// pool's existing assets.
///
/// First-depositor donation-attack mitigation (Path A, locked Day 3):
/// when total_shares == 0, callers MUST pass total_assets_pre_deposit == 0.
/// `compute_shares_to_mint` enforces this — call sites must pre-validate
/// (cheap) so the error surfaces with the expected SeedlingError variant
/// instead of a math underflow.
pub fn compute_shares_to_mint(
    amount: u64,
    total_shares: u64,
    total_assets_pre_deposit: u64,
) -> Result<u64> {
    if total_shares == 0 {
        // First depositor. If the vault has unclaimed assets, that's the
        // donation attack — refuse the deposit loudly. Caller's responsibility
        // to surface a useful error; here we treat it as InvalidAmount.
        require!(
            total_assets_pre_deposit == 0,
            SeedlingError::InvalidAmount
        );
        return Ok(amount);
    }

    // shares = floor(amount × total_shares / ceil(total_assets_pre_deposit))
    // We don't actually ceil() the denominator — kvault uses ceil to inflate
    // the divisor (defense), but for u64 with no fractional component, ceil
    // is a no-op. The 1+ buffer protects against zero-denominator edge cases.
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
) -> Result<u64> {
    require!(total_shares > 0, SeedlingError::InsufficientShares);
    let assets = (shares_to_burn as u128)
        .checked_mul(total_assets as u128)
        .ok_or(SeedlingError::Overflow)?
        .checked_div(total_shares as u128)
        .ok_or(SeedlingError::DivisionByZero)?;
    u64::try_from(assets).map_err(|_| SeedlingError::Overflow.into())
}

/// Inverse for monthly allowance: how many shares to burn to get N assets out.
/// Ceiling here so the user receives AT LEAST `target_assets` (this is the
/// kid getting their allowance — short-changing them by a base unit is bad
/// UX). Vault still benefits from rounding because it's burning slightly more
/// shares than strictly-pro-rata.
pub fn compute_shares_for_assets(
    target_assets: u64,
    total_shares: u64,
    total_assets: u64,
) -> Result<u64> {
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
) -> Result<()> {
    family_position.shares = family_position
        .shares
        .checked_add(shares_to_mint)
        .ok_or(SeedlingError::Overflow)?;
    vault_config.total_shares = vault_config
        .total_shares
        .checked_add(shares_to_mint)
        .ok_or(SeedlingError::Overflow)?;
    Ok(())
}

pub fn burn_family_shares(
    vault_config: &mut VaultConfig,
    family_position: &mut FamilyPosition,
    shares_to_burn: u64,
) -> Result<()> {
    require!(
        family_position.shares >= shares_to_burn,
        SeedlingError::InsufficientShares
    );
    family_position.shares -= shares_to_burn;
    vault_config.total_shares = vault_config
        .total_shares
        .checked_sub(shares_to_burn)
        .ok_or(SeedlingError::Underflow)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vc() -> VaultConfig {
        VaultConfig {
            authority: Pubkey::default(),
            treasury: Pubkey::default(),
            fee_bps: 1000,
            kamino_reserve: Pubkey::default(),
            usdc_mint: Pubkey::default(),
            ctoken_mint: Pubkey::default(),
            oracle_pyth: Pubkey::default(),
            oracle_switchboard_price: Pubkey::default(),
            oracle_switchboard_twap: Pubkey::default(),
            oracle_scope_config: Pubkey::default(),
            total_shares: 0,
            last_known_total_assets: 0,
            period_end_ts: 0,
            current_period_id: 0,
            is_paused: false,
            bump: 0,
        }
    }

    fn fp() -> FamilyPosition {
        FamilyPosition {
            parent: Pubkey::default(),
            kid: Pubkey::default(),
            shares: 0,
            principal_deposited: 0,
            principal_remaining: 0,
            stream_rate: 0,
            created_at: 0,
            last_distribution: 0,
            last_bonus_period_id: 0,
            total_yield_earned: 0,
            bump: 0,
        }
    }

    // ===== compute_shares_to_mint =====

    #[test]
    fn first_deposit_is_one_to_one() {
        let s = compute_shares_to_mint(1000, 0, 0).unwrap();
        assert_eq!(s, 1000);
    }

    #[test]
    fn first_deposit_with_existing_assets_is_donation_attack() {
        // Vault has 100 USDC stuck but no shares — deposit must refuse.
        let result = compute_shares_to_mint(1000, 0, 100);
        assert!(result.is_err());
    }

    #[test]
    fn second_deposit_dilutes_correctly_no_yield() {
        // total_shares=1000, total_assets=1000 (no yield yet).
        // 500 deposit → floor(500 × 1000 / 1000) = 500 shares.
        let s = compute_shares_to_mint(500, 1000, 1000).unwrap();
        assert_eq!(s, 500);
    }

    #[test]
    fn second_deposit_post_yield_mints_fewer_shares() {
        // total_shares=1000, total_assets=1080 (8% yield).
        // 500 deposit → floor(500 × 1000 / 1080) = 462 shares (dilution from yield).
        let s = compute_shares_to_mint(500, 1000, 1080).unwrap();
        assert_eq!(s, 462);
    }

    #[test]
    fn deposit_into_lossy_vault_mints_extra_shares() {
        // Edge case: vault somehow has 900 USDC but 1000 shares.
        // 500 deposit → floor(500 × 1000 / 900) = 555. User gets 'extra' shares
        // because their USDC is buying into a discounted pool. This is correct
        // behavior — kvault does the same.
        let s = compute_shares_to_mint(500, 1000, 900).unwrap();
        assert_eq!(s, 555);
    }

    // ===== compute_assets_for_shares =====

    #[test]
    fn redeem_floor_favors_vault() {
        // total_shares=1000, total_assets=1080. Burn 100 shares.
        // assets = floor(100 × 1080 / 1000) = 108. Exact in this case.
        let a = compute_assets_for_shares(100, 1000, 1080).unwrap();
        assert_eq!(a, 108);
    }

    #[test]
    fn redeem_with_dust_truncates() {
        // 1 share at total=1000, assets=1080 → floor(1 * 1080 / 1000) = 1.
        let a = compute_assets_for_shares(1, 1000, 1080).unwrap();
        assert_eq!(a, 1);
    }

    // ===== compute_shares_for_assets =====

    #[test]
    fn ceil_for_target_assets_burns_at_least_enough() {
        // total_shares=1000, total_assets=1080. Need 50 USDC.
        // ceil(50 × 1000 / 1080) = ceil(46.30) = 47.
        let s = compute_shares_for_assets(50, 1000, 1080).unwrap();
        assert_eq!(s, 47);
    }

    #[test]
    fn ceil_exact_division() {
        // Need 100, share price exactly 1.0 → 100 shares.
        let s = compute_shares_for_assets(100, 1000, 1000).unwrap();
        assert_eq!(s, 100);
    }

    // ===== mint_family_shares / burn_family_shares =====

    #[test]
    fn mint_updates_both_fields_atomically() {
        let mut v = vc();
        let mut f = fp();
        mint_family_shares(&mut v, &mut f, 100).unwrap();
        assert_eq!(v.total_shares, 100);
        assert_eq!(f.shares, 100);
    }

    #[test]
    fn burn_updates_both_fields_atomically() {
        let mut v = vc();
        let mut f = fp();
        v.total_shares = 100;
        f.shares = 100;
        burn_family_shares(&mut v, &mut f, 30).unwrap();
        assert_eq!(v.total_shares, 70);
        assert_eq!(f.shares, 70);
    }

    #[test]
    fn burn_more_than_owned_fails() {
        let mut v = vc();
        let mut f = fp();
        v.total_shares = 100;
        f.shares = 50;
        let result = burn_family_shares(&mut v, &mut f, 60);
        assert!(result.is_err());
    }

    #[test]
    fn invariant_holds_through_mint_burn_sequence() {
        let mut v = vc();
        let mut f = fp();
        mint_family_shares(&mut v, &mut f, 100).unwrap();
        mint_family_shares(&mut v, &mut f, 50).unwrap();
        burn_family_shares(&mut v, &mut f, 30).unwrap();
        assert_eq!(v.total_shares, f.shares);
        assert_eq!(v.total_shares, 120);
    }
}
