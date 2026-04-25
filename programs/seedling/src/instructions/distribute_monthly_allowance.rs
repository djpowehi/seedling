use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::sysvar;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SeedlingError;
use crate::events::MonthlyAllowanceDistributed;
use crate::instructions::deposit::KLEND_PROGRAM_ID;
use crate::state::{FamilyPosition, KidView, VaultConfig};
use crate::utils::{burn_family_shares, compute_shares_for_assets, compute_split};

/// 30 days in seconds. Monthly gate between distributions.
pub const MONTHLY_GATE_SECS: i64 = 30 * 86_400;

const DISC_REFRESH_RESERVE: [u8; 8] = [2, 218, 138, 235, 79, 201, 25, 102];
const DISC_REDEEM_RESERVE_COLLATERAL: [u8; 8] = [234, 117, 181, 125, 185, 142, 220, 29];

/// Distribute the family's `stream_rate` USDC to the kid, monthly-gated.
///
/// Permissionless: anyone can call, but the 30-day gate + family has_one
/// prevent abuse. Seedling operates a keeper in practice.
///
/// Principal-first drawdown (Day-3 lock): stream_rate comes out of
/// principal until principal_remaining == 0, then from yield. Bonus at
/// period end claims the remaining yield.
///
/// Fee is collected at THIS event (post Day-5 timing fix). Yield delta
/// between distributions is the fee base; 10% to treasury before the kid
/// receives allowance.
// Box<> heavy fields per GOTCHAS #4.
#[derive(Accounts)]
pub struct DistributeMonthlyAllowance<'info> {
    /// Anyone can trigger the distribute (permissionless crank). They pay
    /// the tx fee but don't authorize anything — gating is enforced by the
    /// 30-day timestamp check.
    #[account(mut)]
    pub keeper: Signer<'info>,

    #[account(mut)]
    pub family_position: Box<Account<'info, FamilyPosition>>,

    /// Read-only PDA confirming this family_position's kid identity.
    #[account(
        seeds = [KidView::SEED_PREFIX, family_position.parent.as_ref(), family_position.kid.as_ref()],
        bump = kid_view.bump,
        constraint = kid_view.family_position == family_position.key() @ SeedlingError::InvalidAuthority,
    )]
    pub kid_view: Box<Account<'info, KidView>>,

    /// Kid's USDC ATA — destination of the monthly allowance. Owned by the
    /// kid's pubkey directly (not the KidView PDA) so the kid can move the
    /// funds with their own wallet if/when they ever sign transactions.
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = kid_owner,
    )]
    pub kid_usdc_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// The kid's actual pubkey. Referenced only for the kid_usdc_ata's
    /// authority constraint. Must match family_position.kid.
    /// CHECK: validated via constraint.
    #[account(address = family_position.kid @ SeedlingError::InvalidAuthority)]
    pub kid_owner: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_config,
    )]
    pub vault_usdc_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint = ctoken_mint,
        associated_token::authority = vault_config,
    )]
    pub vault_ctoken_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = treasury_usdc_ata.key() == vault_config.treasury @ SeedlingError::InvalidAuthority,
        constraint = treasury_usdc_ata.mint == vault_config.usdc_mint @ SeedlingError::MintMismatch,
    )]
    pub treasury_usdc_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [VaultConfig::SEED],
        bump = vault_config.bump,
        constraint = !vault_config.is_paused @ SeedlingError::VaultPaused,
    )]
    pub vault_config: Box<Account<'info, VaultConfig>>,

    #[account(address = vault_config.usdc_mint @ SeedlingError::MintMismatch)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, address = vault_config.ctoken_mint @ SeedlingError::MintMismatch)]
    pub ctoken_mint: Box<InterfaceAccount<'info, Mint>>,

    // ===== Kamino CPI accounts =====
    /// CHECK: address-validated.
    #[account(mut, address = vault_config.kamino_reserve @ SeedlingError::ReserveMismatch)]
    pub kamino_reserve: UncheckedAccount<'info>,
    /// CHECK: klend validates via reserve.has_one.
    pub lending_market: UncheckedAccount<'info>,
    /// CHECK: klend validates the PDA.
    pub lending_market_authority: UncheckedAccount<'info>,
    /// CHECK: klend validates via reserve.liquidity.supply_vault.
    #[account(mut)]
    pub reserve_liquidity_supply: UncheckedAccount<'info>,

    /// CHECK: validated in handler.
    pub oracle_pyth: UncheckedAccount<'info>,
    /// CHECK: validated in handler.
    pub oracle_switchboard_price: UncheckedAccount<'info>,
    /// CHECK: validated in handler.
    pub oracle_switchboard_twap: UncheckedAccount<'info>,
    /// CHECK: validated in handler.
    pub oracle_scope_config: UncheckedAccount<'info>,

    /// CHECK: address-constrained.
    #[account(address = KLEND_PROGRAM_ID)]
    pub kamino_program: UncheckedAccount<'info>,
    /// CHECK: fixed sysvar ID.
    #[account(address = sysvar::instructions::ID)]
    pub instruction_sysvar: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn distribute_monthly_allowance_handler(
    ctx: Context<DistributeMonthlyAllowance>,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // ---- 1. 30-day gate ----
    let elapsed_required = ctx
        .accounts
        .family_position
        .last_distribution
        .checked_add(MONTHLY_GATE_SECS)
        .ok_or(SeedlingError::Overflow)?;
    require!(now >= elapsed_required, SeedlingError::TooEarly);

    let vault_config_key = ctx.accounts.vault_config.key();
    let vault_config_bump = ctx.accounts.vault_config.bump;
    let vault_config_account_info = ctx.accounts.vault_config.to_account_info();
    let stream_rate = ctx.accounts.family_position.stream_rate;
    require!(stream_rate > 0, SeedlingError::InvalidAmount);

    // Oracle validation.
    let vault_config_oracles = (
        ctx.accounts.vault_config.oracle_pyth,
        ctx.accounts.vault_config.oracle_switchboard_price,
        ctx.accounts.vault_config.oracle_switchboard_twap,
        ctx.accounts.vault_config.oracle_scope_config,
    );
    let check_oracle = |cached: &Pubkey, passed: &Pubkey| -> Result<()> {
        if *cached != Pubkey::default() {
            require_keys_eq!(*passed, *cached, SeedlingError::OracleMismatch);
        }
        Ok(())
    };
    check_oracle(&vault_config_oracles.0, &ctx.accounts.oracle_pyth.key())?;
    check_oracle(
        &vault_config_oracles.1,
        &ctx.accounts.oracle_switchboard_price.key(),
    )?;
    check_oracle(
        &vault_config_oracles.2,
        &ctx.accounts.oracle_switchboard_twap.key(),
    )?;
    check_oracle(
        &vault_config_oracles.3,
        &ctx.accounts.oracle_scope_config.key(),
    )?;

    // ---- 2. Refresh Kamino reserve ----
    {
        let metas = vec![
            AccountMeta::new(ctx.accounts.kamino_reserve.key(), false),
            AccountMeta::new_readonly(ctx.accounts.lending_market.key(), false),
            AccountMeta::new_readonly(ctx.accounts.oracle_pyth.key(), false),
            AccountMeta::new_readonly(ctx.accounts.oracle_switchboard_price.key(), false),
            AccountMeta::new_readonly(ctx.accounts.oracle_switchboard_twap.key(), false),
            AccountMeta::new_readonly(ctx.accounts.oracle_scope_config.key(), false),
        ];
        let infos = [
            ctx.accounts.kamino_reserve.to_account_info(),
            ctx.accounts.lending_market.to_account_info(),
            ctx.accounts.oracle_pyth.to_account_info(),
            ctx.accounts.oracle_switchboard_price.to_account_info(),
            ctx.accounts.oracle_switchboard_twap.to_account_info(),
            ctx.accounts.oracle_scope_config.to_account_info(),
        ];
        invoke(
            &Instruction {
                program_id: KLEND_PROGRAM_ID,
                accounts: metas,
                data: DISC_REFRESH_RESERVE.to_vec(),
            },
            &infos,
        )?;
    }

    ctx.accounts.vault_ctoken_ata.reload()?;
    ctx.accounts.vault_usdc_ata.reload()?;
    let vault_usdc_pre_redeem = ctx.accounts.vault_usdc_ata.amount;

    // ---- 3. Path B total_assets ----
    let reserve_data = ctx.accounts.kamino_reserve.try_borrow_data()?;
    require!(
        reserve_data.len() >= 248,
        SeedlingError::InvalidAccountState
    );
    let total_available_amount = u64::from_le_bytes(
        reserve_data[224..232]
            .try_into()
            .map_err(|_| SeedlingError::InvalidAccountState)?,
    );
    let borrowed_amount_sf = u128::from_le_bytes(
        reserve_data[232..248]
            .try_into()
            .map_err(|_| SeedlingError::InvalidAccountState)?,
    );
    drop(reserve_data);
    let borrowed_amount =
        u64::try_from(borrowed_amount_sf >> 60).map_err(|_| SeedlingError::Overflow)?;
    let kamino_total_liquidity = total_available_amount
        .checked_add(borrowed_amount)
        .ok_or(SeedlingError::Overflow)?;
    let collateral_supply = ctx.accounts.ctoken_mint.supply;
    let vault_ctokens_held = ctx.accounts.vault_ctoken_ata.amount;
    let total_assets_current: u64 = if vault_ctokens_held == 0 || collateral_supply == 0 {
        0
    } else {
        let prod = (vault_ctokens_held as u128)
            .checked_mul(kamino_total_liquidity as u128)
            .ok_or(SeedlingError::Overflow)?;
        u64::try_from(
            prod.checked_div(collateral_supply as u128)
                .ok_or(SeedlingError::DivisionByZero)?,
        )
        .map_err(|_| SeedlingError::Overflow)?
    };

    // ---- 4. Harvest + fee (real fee collection at cToken-redeeming event) ----
    // Fee is 10% of yield delta since last harvest. We don't CPI-transfer
    // here — we REDEEM extra cTokens in step 6 to cover fee + stream_rate
    // together, then split the USDC in step 7.
    let split = compute_split(
        ctx.accounts.vault_config.last_known_total_assets,
        total_assets_current,
        ctx.accounts.vault_config.fee_bps,
    )?;
    let fee_to_treasury = split.fee_to_treasury;

    // ---- 5. Share math: how many shares does stream_rate USDC equal? ----
    // Using post-fee total_assets (fee conceptually leaves the pool first).
    let total_assets_post_fee = total_assets_current
        .checked_sub(fee_to_treasury)
        .ok_or(SeedlingError::Underflow)?;
    let total_shares = ctx.accounts.vault_config.total_shares;
    require!(total_shares > 0, SeedlingError::InsufficientShares);
    let shares_to_burn =
        compute_shares_for_assets(stream_rate, total_shares, total_assets_post_fee.max(1))?;
    require!(
        ctx.accounts.family_position.shares >= shares_to_burn,
        SeedlingError::InsufficientShares
    );

    // ---- 6. Redeem (stream_rate + fee) worth of cTokens in one CPI ----
    // We pull out stream_rate USDC for the kid + fee USDC for the treasury
    // in a single Kamino redeem. Ceiling on collateral burn so we get at
    // least (stream_rate + fee) back. Vault absorbs 1-2 base-unit dust.
    let total_usdc_to_redeem = stream_rate
        .checked_add(fee_to_treasury)
        .ok_or(SeedlingError::Overflow)?;
    let collateral_to_burn: u64 = {
        let num = (total_usdc_to_redeem as u128)
            .checked_mul(collateral_supply as u128)
            .ok_or(SeedlingError::Overflow)?;
        let raw = num
            .checked_add((kamino_total_liquidity as u128).saturating_sub(1))
            .ok_or(SeedlingError::Overflow)?
            .checked_div(kamino_total_liquidity as u128)
            .ok_or(SeedlingError::DivisionByZero)?;
        u64::try_from(raw)
            .map_err(|_| SeedlingError::Overflow)?
            .min(vault_ctokens_held)
    };

    let vault_bump = [vault_config_bump];
    let signer_seeds: &[&[&[u8]]] = &[&[VaultConfig::SEED, &vault_bump]];

    {
        let mut data = DISC_REDEEM_RESERVE_COLLATERAL.to_vec();
        data.extend_from_slice(&collateral_to_burn.to_le_bytes());
        let ix = Instruction {
            program_id: KLEND_PROGRAM_ID,
            accounts: vec![
                AccountMeta::new_readonly(vault_config_key, true),
                AccountMeta::new_readonly(ctx.accounts.lending_market.key(), false),
                AccountMeta::new(ctx.accounts.kamino_reserve.key(), false),
                AccountMeta::new_readonly(ctx.accounts.lending_market_authority.key(), false),
                AccountMeta::new_readonly(ctx.accounts.usdc_mint.key(), false),
                AccountMeta::new(ctx.accounts.ctoken_mint.key(), false),
                AccountMeta::new(ctx.accounts.reserve_liquidity_supply.key(), false),
                AccountMeta::new(ctx.accounts.vault_ctoken_ata.key(), false),
                AccountMeta::new(ctx.accounts.vault_usdc_ata.key(), false),
                AccountMeta::new_readonly(anchor_spl::token::ID, false),
                AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                AccountMeta::new_readonly(ctx.accounts.instruction_sysvar.key(), false),
            ],
            data,
        };
        let infos: &[AccountInfo] = &[
            vault_config_account_info.clone(),
            ctx.accounts.lending_market.to_account_info(),
            ctx.accounts.kamino_reserve.to_account_info(),
            ctx.accounts.lending_market_authority.to_account_info(),
            ctx.accounts.usdc_mint.to_account_info(),
            ctx.accounts.ctoken_mint.to_account_info(),
            ctx.accounts.reserve_liquidity_supply.to_account_info(),
            ctx.accounts.vault_ctoken_ata.to_account_info(),
            ctx.accounts.vault_usdc_ata.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.instruction_sysvar.to_account_info(),
        ];
        invoke_signed(&ix, infos, signer_seeds)?;
    }

    ctx.accounts.vault_usdc_ata.reload()?;
    let vault_usdc_post_redeem = ctx.accounts.vault_usdc_ata.amount;
    let actual_usdc_received = vault_usdc_post_redeem.saturating_sub(vault_usdc_pre_redeem);

    // ---- 7. Split USDC: fee → treasury, stream_rate → kid ----
    // If Kamino returned slightly less than (stream_rate + fee), prioritize
    // paying the kid their full stream_rate; shave the fee. Same dust
    // absorption strategy as withdraw.
    let kid_amount = stream_rate.min(actual_usdc_received);
    let fee_amount = actual_usdc_received
        .saturating_sub(kid_amount)
        .min(fee_to_treasury);

    // Fee transfer first (smaller amount, less tx fee impact if it's zero).
    if fee_amount > 0 {
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_usdc_ata.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.treasury_usdc_ata.to_account_info(),
                authority: vault_config_account_info.clone(),
            },
            signer_seeds,
        );
        transfer_checked(cpi_ctx, fee_amount, ctx.accounts.usdc_mint.decimals)?;
    }

    // Kid transfer.
    if kid_amount > 0 {
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_usdc_ata.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.kid_usdc_ata.to_account_info(),
                authority: vault_config_account_info.clone(),
            },
            signer_seeds,
        );
        transfer_checked(cpi_ctx, kid_amount, ctx.accounts.usdc_mint.decimals)?;
    }

    // ---- 8. Burn shares atomically ----
    burn_family_shares(
        &mut ctx.accounts.vault_config,
        &mut ctx.accounts.family_position,
        shares_to_burn,
    )?;

    // ---- 9. Principal-first drawdown accounting ----
    let family = &mut ctx.accounts.family_position;
    let principal_drawdown = kid_amount.min(family.principal_remaining);
    let yield_drawdown = kid_amount.saturating_sub(principal_drawdown);
    family.principal_remaining = family
        .principal_remaining
        .saturating_sub(principal_drawdown);
    family.total_yield_earned = family
        .total_yield_earned
        .checked_add(yield_drawdown)
        .ok_or(SeedlingError::Overflow)?;
    family.last_distribution = now;

    // ---- 10. Update last_known_total_assets ----
    // After redeem, vault's cToken value dropped by roughly
    // (kid_amount + fee_amount). Snapshot post-event Kamino-side value.
    ctx.accounts.vault_config.last_known_total_assets =
        total_assets_post_fee.saturating_sub(kid_amount);

    // ---- 11. Emit ----
    emit!(MonthlyAllowanceDistributed {
        family: ctx.accounts.family_position.key(),
        kid: ctx.accounts.family_position.kid,
        stream_rate: kid_amount,
        principal_drawdown,
        yield_drawdown,
        fee_to_treasury: fee_amount,
        ts: now,
    });

    msg!("distribute_monthly_allowance complete");
    Ok(())
}
