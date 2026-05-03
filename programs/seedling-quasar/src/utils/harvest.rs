use quasar_lang::cpi::Seed;
use quasar_lang::prelude::*;
use quasar_spl::prelude::*;

use crate::errors::SeedlingError;
use crate::state::{VaultConfig, VAULT_CONFIG_SEED};

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
) -> Result<YieldHarvested, ProgramError> {
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
/// treasury (PDA-signed), updates `vault_config.last_known_total_assets`
/// to post-fee snapshot.
///
/// All accounts come in via AccountView (zero-copy). Vault PDA seeds are
/// constructed once and used as the signer for the transfer CPI.
#[allow(clippy::too_many_arguments)]
pub fn harvest_and_fee(
    vault_config: &mut VaultConfig,
    current_total_assets: u64,
    vault_usdc_source: &AccountView,
    treasury_destination: &AccountView,
    usdc_mint: &AccountView,
    usdc_decimals: u8,
    vault_config_view: &AccountView,
    token_program: &AccountView,
) -> Result<YieldHarvested, ProgramError> {
    let split = compute_split(
        vault_config.last_known_total_assets.get(),
        current_total_assets,
        vault_config.fee_bps.get(),
    )?;

    if split.fee_to_treasury > 0 {
        let bump = [vault_config.bump];
        let signer_seeds = [Seed::from(VAULT_CONFIG_SEED), Seed::from(&bump)];

        // Manually construct a TokenInterface transfer_checked call. We can't
        // use the helper method because the AccountView is a raw view, not
        // an InterfaceAccount<Token>. The discriminator + layout match SPL
        // Token transfer_checked.
        use core::mem::MaybeUninit;
        use quasar_lang::cpi::{CpiCall, InstructionAccount};

        let data = unsafe {
            let mut buf = MaybeUninit::<[u8; 10]>::uninit();
            let ptr = buf.as_mut_ptr() as *mut u8;
            core::ptr::write(ptr, 12); // SPL Token TransferChecked discriminator
            (ptr.add(1) as *mut u64).write_unaligned(split.fee_to_treasury);
            core::ptr::write(ptr.add(9), usdc_decimals);
            buf.assume_init()
        };

        let call: CpiCall<4, 10> = CpiCall::new(
            token_program.address(),
            [
                InstructionAccount::writable(vault_usdc_source.address()),
                InstructionAccount::readonly(usdc_mint.address()),
                InstructionAccount::writable(treasury_destination.address()),
                InstructionAccount::readonly_signer(vault_config_view.address()),
            ],
            [
                vault_usdc_source,
                usdc_mint,
                treasury_destination,
                vault_config_view,
            ],
            data,
        );
        call.invoke_signed(&signer_seeds)?;
    }

    // Snapshot for next yield calc starts at post-fee total.
    let new_last_known = current_total_assets
        .checked_sub(split.fee_to_treasury)
        .ok_or(SeedlingError::Underflow)?;
    vault_config.last_known_total_assets = new_last_known.into();

    Ok(split)
}

#[cfg(test)]
mod tests {
    extern crate std;
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
        let r = compute_split(1000, 950, 1000).unwrap();
        assert_eq!(r.gross_yield, 0);
        assert_eq!(r.fee_to_treasury, 0);
    }

    #[test]
    fn standard_yield_split_at_10pct() {
        let r = compute_split(1000, 1080, 1000).unwrap();
        assert_eq!(r.gross_yield, 80);
        assert_eq!(r.fee_to_treasury, 8);
        assert_eq!(r.net_yield_retained, 72);
    }

    #[test]
    fn standard_yield_split_at_25pct_v2() {
        // Quasar v2 fee jumped 10% → 25%. Verify the math.
        // last=1000, current=1080, fee_bps=2500. gross=80, fee=20, net=60.
        let r = compute_split(1000, 1080, 2500).unwrap();
        assert_eq!(r.gross_yield, 80);
        assert_eq!(r.fee_to_treasury, 20);
        assert_eq!(r.net_yield_retained, 60);
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
        // gross = u64::MAX, fee_bps = 1000. Without u128 intermediate the
        // multiply would overflow. With it, fee = u64::MAX * 1000 / 10000.
        let r = compute_split(0, u64::MAX, 1000).unwrap();
        assert_eq!(r.gross_yield, u64::MAX);
        assert_eq!(r.fee_to_treasury, u64::MAX / 10);
        assert_eq!(r.net_yield_retained, u64::MAX - r.fee_to_treasury);
    }
}
