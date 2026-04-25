use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::sysvar;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SeedlingError;
use crate::events::BonusDistributed;
use crate::instructions::deposit::KLEND_PROGRAM_ID;
use crate::state::{FamilyPosition, KidView, VaultConfig};
use crate::utils::{burn_family_shares, compute_split};

/// Dust threshold: refuse to distribute a bonus smaller than this. Avoids
/// zero-value transactions and keeper spam.
pub const BONUS_DUST_THRESHOLD: u64 = 10_000; // 0.01 USDC

const DISC_REFRESH_RESERVE: [u8; 8] = [2, 218, 138, 235, 79, 201, 25, 102];
const DISC_REDEEM_RESERVE_COLLATERAL: [u8; 8] = [234, 117, 181, 125, 185, 142, 220, 29];

/// Period-end "13th allowance" / summer bonus.
///
/// - Time gate: `now >= vault_config.period_end_ts`
/// - Double-claim guard: `family_position.last_bonus_period_id < vault_config.current_period_id`
/// - Bonus amount: `max(0, family_assets - principal_remaining)` — pure yield
/// - Principal is NOT touched (locked Day 3)
/// - 10% fee on the gross yield delta since last harvest (pays on redeem)
// Box<> heavy fields per GOTCHAS #4.
#[derive(Accounts)]
pub struct DistributeBonus<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,

    #[account(mut)]
    pub family_position: Box<Account<'info, FamilyPosition>>,

    #[account(
        seeds = [KidView::SEED_PREFIX, family_position.parent.as_ref(), family_position.kid.as_ref()],
        bump = kid_view.bump,
        constraint = kid_view.family_position == family_position.key() @ SeedlingError::InvalidAuthority,
    )]
    pub kid_view: Box<Account<'info, KidView>>,

    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = kid_owner,
    )]
    pub kid_usdc_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// CHECK: must equal family_position.kid — enforced by constraint.
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

    #[account(mut, address = vault_config.kamino_reserve @ SeedlingError::ReserveMismatch)]
    /// CHECK: address-validated.
    pub kamino_reserve: UncheckedAccount<'info>,
    /// CHECK: klend validates.
    pub lending_market: UncheckedAccount<'info>,
    /// CHECK: klend validates.
    pub lending_market_authority: UncheckedAccount<'info>,
    /// CHECK: klend validates.
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
    /// CHECK: fixed sysvar.
    #[account(address = sysvar::instructions::ID)]
    pub instruction_sysvar: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn distribute_bonus_handler(ctx: Context<DistributeBonus>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;

    // ---- 1. Period gate ----
    require!(
        now >= ctx.accounts.vault_config.period_end_ts,
        SeedlingError::BonusPeriodNotEnded
    );
    // Double-claim guard
    require!(
        ctx.accounts.family_position.last_bonus_period_id
            < ctx.accounts.vault_config.current_period_id,
        SeedlingError::BonusAlreadyPaid
    );

    let vault_config_key = ctx.accounts.vault_config.key();
    let vault_config_bump = ctx.accounts.vault_config.bump;
    let vault_config_account_info = ctx.accounts.vault_config.to_account_info();
    let current_period_id = ctx.accounts.vault_config.current_period_id;

    // Oracle validation (same pattern).
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

    // ---- 2. Refresh reserve ----
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

    // ---- 4. Harvest + fee ----
    let split = compute_split(
        ctx.accounts.vault_config.last_known_total_assets,
        total_assets_current,
        ctx.accounts.vault_config.fee_bps,
    )?;
    let fee_to_treasury = split.fee_to_treasury;
    let total_assets_post_fee = total_assets_current
        .checked_sub(fee_to_treasury)
        .ok_or(SeedlingError::Underflow)?;

    // ---- 5. Compute family's bonus: family_assets - principal_remaining ----
    let total_shares = ctx.accounts.vault_config.total_shares;
    require!(total_shares > 0, SeedlingError::InsufficientShares);
    let family_shares = ctx.accounts.family_position.shares;
    let family_assets: u64 = {
        let prod = (family_shares as u128)
            .checked_mul(total_assets_post_fee as u128)
            .ok_or(SeedlingError::Overflow)?;
        u64::try_from(
            prod.checked_div(total_shares as u128)
                .ok_or(SeedlingError::DivisionByZero)?,
        )
        .map_err(|_| SeedlingError::Overflow)?
    };
    let bonus = family_assets.saturating_sub(ctx.accounts.family_position.principal_remaining);
    require!(
        bonus > BONUS_DUST_THRESHOLD,
        SeedlingError::BelowDustThreshold
    );

    // ---- 6. Burn shares for the bonus + redeem ----
    let shares_to_burn: u64 = {
        // ceil(bonus × total_shares / total_assets_post_fee)
        let num = (bonus as u128)
            .checked_mul(total_shares as u128)
            .ok_or(SeedlingError::Overflow)?;
        let denom = (total_assets_post_fee as u128).max(1);
        let raw = num
            .checked_add(denom - 1)
            .ok_or(SeedlingError::Overflow)?
            .checked_div(denom)
            .ok_or(SeedlingError::DivisionByZero)?;
        u64::try_from(raw)
            .map_err(|_| SeedlingError::Overflow)?
            .min(family_shares)
    };

    let total_usdc_to_redeem = bonus
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

    // Split: kid gets bonus (capped at actual), treasury gets rest up to fee.
    let kid_amount = bonus.min(actual_usdc_received);
    let fee_amount = actual_usdc_received
        .saturating_sub(kid_amount)
        .min(fee_to_treasury);

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

    // ---- 7. Burn shares atomically ----
    burn_family_shares(
        &mut ctx.accounts.vault_config,
        &mut ctx.accounts.family_position,
        shares_to_burn,
    )?;

    // ---- 8. Accounting: principal NOT touched (locked Day 3) ----
    let family = &mut ctx.accounts.family_position;
    family.total_yield_earned = family
        .total_yield_earned
        .checked_add(kid_amount)
        .ok_or(SeedlingError::Overflow)?;
    family.last_bonus_period_id = current_period_id;

    ctx.accounts.vault_config.last_known_total_assets =
        total_assets_post_fee.saturating_sub(kid_amount);

    // ---- 9. Emit ----
    emit!(BonusDistributed {
        family: ctx.accounts.family_position.key(),
        kid: ctx.accounts.family_position.kid,
        amount: kid_amount,
        fee_to_treasury: fee_amount,
        period_id: current_period_id,
        ts: now,
    });

    msg!("distribute_bonus complete");
    Ok(())
}
