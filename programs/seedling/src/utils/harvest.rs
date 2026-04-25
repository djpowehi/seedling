use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SeedlingError;
use crate::state::VaultConfig;

/// Returned by `harvest_and_fee`. Callers emit these values in their event
/// log so on-chain history shows the per-instruction fee/yield breakdown.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct YieldHarvested {
    pub gross_yield: u64,
    pub fee_to_treasury: u64,
    pub net_yield_retained: u64,
}

/// Pure math: split `current_total_assets - last_known` into fee + net.
/// Edge case: current <= last_known => no yield, no fee, no-op.
///
/// CRITICAL: callers must update `vault_config.last_known_total_assets` to
/// `current_total_assets - fee` AFTER successfully transferring the fee out.
/// `compute_split` is intentionally side-effect-free so it's testable in
/// isolation.
pub fn compute_split(
    last_known_total_assets: u64,
    current_total_assets: u64,
    fee_bps: u16,
) -> Result<YieldHarvested> {
    if current_total_assets <= last_known_total_assets {
        return Ok(YieldHarvested {
            gross_yield: 0,
            fee_to_treasury: 0,
            net_yield_retained: 0,
        });
    }

    let gross_yield = current_total_assets
        .checked_sub(last_known_total_assets)
        .ok_or(SeedlingError::Underflow)?;

    let fee = (gross_yield as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(SeedlingError::Overflow)?
        .checked_div(10_000)
        .ok_or(SeedlingError::DivisionByZero)?;
    let fee = u64::try_from(fee).map_err(|_| SeedlingError::Overflow)?;

    let net_yield_retained = gross_yield
        .checked_sub(fee)
        .ok_or(SeedlingError::Underflow)?;

    Ok(YieldHarvested {
        gross_yield,
        fee_to_treasury: fee,
        net_yield_retained,
    })
}

/// Production helper: computes split, transfers fee USDC from vault to
/// treasury (PDA-signed), updates `vault_config.last_known_total_assets` to
/// post-fee snapshot.
///
/// `vault_config_bump` is passed explicitly so we don't reborrow vault_config
/// during the CPI signer-seeds construction.
#[allow(clippy::too_many_arguments)]
pub fn harvest_and_fee<'info>(
    vault_config: &mut VaultConfig,
    vault_config_key: Pubkey,
    vault_config_bump: u8,
    current_total_assets: u64,
    vault_usdc_source: &InterfaceAccount<'info, TokenAccount>,
    treasury_destination: &InterfaceAccount<'info, TokenAccount>,
    usdc_mint: &InterfaceAccount<'info, Mint>,
    vault_config_account_info: AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<YieldHarvested> {
    let split = compute_split(
        vault_config.last_known_total_assets,
        current_total_assets,
        vault_config.fee_bps,
    )?;

    if split.fee_to_treasury > 0 {
        let bump = [vault_config_bump];
        let seeds: &[&[u8]] = &[VaultConfig::SEED, &bump];
        let signer_seeds: &[&[&[u8]]] = &[seeds];

        let cpi_accounts = TransferChecked {
            from: vault_usdc_source.to_account_info(),
            mint: usdc_mint.to_account_info(),
            to: treasury_destination.to_account_info(),
            authority: vault_config_account_info,
        };
        let cpi_ctx = CpiContext::new_with_signer(
            token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        transfer_checked(cpi_ctx, split.fee_to_treasury, usdc_mint.decimals)?;

        // Sanity guard against a misconfigured vault_config_key.
        // `vault_config_account_info.key` MUST equal `vault_config_key`.
        // Cheap require for defense-in-depth.
        require_keys_eq!(
            vault_usdc_source.owner,
            vault_config_key,
            SeedlingError::InvalidAuthority
        );
    }

    // Snapshot for next yield calc starts at post-fee total.
    vault_config.last_known_total_assets = current_total_assets
        .checked_sub(split.fee_to_treasury)
        .ok_or(SeedlingError::Underflow)?;

    Ok(split)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_yield_means_no_fee() {
        let r = compute_split(1000, 1000, 1000).unwrap();
        assert_eq!(r.gross_yield, 0);
        assert_eq!(r.fee_to_treasury, 0);
        assert_eq!(r.net_yield_retained, 0);
    }

    #[test]
    fn negative_delta_means_no_fee() {
        // Could happen briefly between CPIs (e.g., redeem in flight). Treat as zero.
        let r = compute_split(1000, 950, 1000).unwrap();
        assert_eq!(r.gross_yield, 0);
        assert_eq!(r.fee_to_treasury, 0);
    }

    #[test]
    fn standard_yield_split_at_10pct() {
        // last=1000, current=1080, fee_bps=1000 (10%). gross=80, fee=8, net=72.
        let r = compute_split(1000, 1080, 1000).unwrap();
        assert_eq!(r.gross_yield, 80);
        assert_eq!(r.fee_to_treasury, 8);
        assert_eq!(r.net_yield_retained, 72);
    }

    #[test]
    fn dust_yield_rounds_fee_down() {
        // gross=5, fee=floor(5*1000/10000)=0. Vault keeps all 5.
        let r = compute_split(1000, 1005, 1000).unwrap();
        assert_eq!(r.gross_yield, 5);
        assert_eq!(r.fee_to_treasury, 0);
        assert_eq!(r.net_yield_retained, 5);
    }

    #[test]
    fn zero_fee_bps_means_protocol_takes_nothing() {
        let r = compute_split(1000, 1080, 0).unwrap();
        assert_eq!(r.gross_yield, 80);
        assert_eq!(r.fee_to_treasury, 0);
        assert_eq!(r.net_yield_retained, 80);
    }

    #[test]
    fn full_fee_bps_means_protocol_takes_all() {
        let r = compute_split(1000, 1080, 10_000).unwrap();
        assert_eq!(r.gross_yield, 80);
        assert_eq!(r.fee_to_treasury, 80);
        assert_eq!(r.net_yield_retained, 0);
    }

    #[test]
    fn large_yield_doesnt_overflow_via_u128_intermediate() {
        // gross = u64::MAX - 1, fee_bps = 1000. Without u128 intermediate the
        // multiply would overflow. With it, fee = (u64::MAX - 1) / 10.
        let last = 0u64;
        let current = u64::MAX;
        let r = compute_split(last, current, 1000).unwrap();
        assert_eq!(r.gross_yield, u64::MAX);
        // fee = floor(u64::MAX * 1000 / 10000) = floor(u64::MAX / 10)
        assert_eq!(r.fee_to_treasury, u64::MAX / 10);
        assert_eq!(r.net_yield_retained, u64::MAX - r.fee_to_treasury);
    }
}
