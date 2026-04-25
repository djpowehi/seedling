use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::sysvar;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SeedlingError;
use crate::events::Withdrawn;
use crate::instructions::deposit::KLEND_PROGRAM_ID;
use crate::state::{FamilyPosition, VaultConfig};
use crate::utils::{burn_family_shares, compute_assets_for_shares};

/// Discriminators verified Day-4 + Day-5 via sha256("global:<name>")[..8].
const DISC_REFRESH_RESERVE: [u8; 8] = [2, 218, 138, 235, 79, 201, 25, 102];
const DISC_REDEEM_RESERVE_COLLATERAL: [u8; 8] = [234, 117, 181, 125, 185, 142, 220, 29];

/// Withdraw USDC ← Kamino ← vault → parent. Burns family shares pro-rata.
///
/// The symmetric opposite of deposit. Key differences flagged inline:
/// - Slippage guard is `assets_out >= min_assets_out` (not min_shares_out)
/// - `principal_remaining` uses `saturating_sub`, not `checked_sub` (locked
///   Day 3: withdrawing yield ABOVE principal clamps remaining to 0 instead
///   of erroring)
/// - `redeem_reserve_collateral` parameter is `collateral_amount` (cTokens
///   to burn), not `liquidity_amount` (USDC received). We compute
///   collateral_to_burn = ceil(assets_out × ctoken_supply / kamino_total_liquidity)
///   to make sure we burn ENOUGH cTokens to receive at least assets_out USDC.
// CONVENTION: Box<> every heavy field. See GOTCHAS.md #4.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        has_one = parent @ SeedlingError::InvalidAuthority,
    )]
    pub family_position: Box<Account<'info, FamilyPosition>>,

    #[account(mut)]
    pub parent: Signer<'info>,

    /// Destination for USDC received on withdraw. Owned by parent.
    #[account(
        mut,
        constraint = parent_usdc_ata.mint == vault_config.usdc_mint @ SeedlingError::MintMismatch,
        constraint = parent_usdc_ata.owner == parent.key() @ SeedlingError::InvalidAuthority,
    )]
    pub parent_usdc_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Vault's USDC ATA — intermediate: Kamino redeems cTokens → vault_usdc_ata,
    /// then we SPL-transfer vault_usdc_ata → parent_usdc_ata.
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault_config,
    )]
    pub vault_usdc_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Vault's cToken ATA — source for the Kamino redeem.
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

    // Kamino burns cTokens during redeem, so ctoken_mint must be mut.
    #[account(mut, address = vault_config.ctoken_mint @ SeedlingError::MintMismatch)]
    pub ctoken_mint: Box<InterfaceAccount<'info, Mint>>,

    // ===== Kamino CPI accounts =====
    /// CHECK: address-validated against cached pubkey on VaultConfig.
    #[account(
        mut,
        address = vault_config.kamino_reserve @ SeedlingError::ReserveMismatch,
    )]
    pub kamino_reserve: UncheckedAccount<'info>,

    /// CHECK: validated transitively via klend's reserve.has_one check.
    pub lending_market: UncheckedAccount<'info>,

    /// CHECK: validated by klend's PDA check inside redeem_reserve_collateral.
    pub lending_market_authority: UncheckedAccount<'info>,

    /// Kamino's USDC supply vault — Kamino moves USDC FROM here TO vault_usdc_ata.
    /// CHECK: validated by klend's has_one-style check.
    #[account(mut)]
    pub reserve_liquidity_supply: UncheckedAccount<'info>,

    // 4 oracle slots — same pattern as deposit. Unused slots receive klend
    // program ID as None sentinel.
    /// CHECK: validated in handler.
    pub oracle_pyth: UncheckedAccount<'info>,
    /// CHECK: validated in handler.
    pub oracle_switchboard_price: UncheckedAccount<'info>,
    /// CHECK: validated in handler.
    pub oracle_switchboard_twap: UncheckedAccount<'info>,
    /// CHECK: validated in handler.
    pub oracle_scope_config: UncheckedAccount<'info>,

    /// CHECK: address-constrained to klend program ID.
    #[account(address = KLEND_PROGRAM_ID)]
    pub kamino_program: UncheckedAccount<'info>,

    /// CHECK: fixed sysvar ID.
    #[account(address = sysvar::instructions::ID)]
    pub instruction_sysvar: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn withdraw_handler(
    ctx: Context<Withdraw>,
    shares_to_burn: u64,
    min_assets_out: u64,
) -> Result<()> {
    require!(shares_to_burn > 0, SeedlingError::InvalidAmount);
    require!(
        ctx.accounts.family_position.shares >= shares_to_burn,
        SeedlingError::InsufficientShares
    );

    let vault_config_key = ctx.accounts.vault_config.key();
    let vault_config_bump = ctx.accounts.vault_config.bump;
    let vault_config_account_info = ctx.accounts.vault_config.to_account_info();
    let vault_config_oracles = (
        ctx.accounts.vault_config.oracle_pyth,
        ctx.accounts.vault_config.oracle_switchboard_price,
        ctx.accounts.vault_config.oracle_switchboard_twap,
        ctx.accounts.vault_config.oracle_scope_config,
    );

    // Oracle validation — same pattern as deposit.
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

    // ---- 1. Kamino refresh_reserve CPI ----
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

    // ---- 2. Compute total_assets via fixed Path B ----
    // Same formula as deposit.rs (post Day-5 fix).
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

    // ---- 3. Share math: burn N shares → receive proportional USDC ----
    // floor rounding favors the vault; withdrawer gets slightly less than
    // strictly pro-rata. Matches master doc §7.6.
    let total_shares = ctx.accounts.vault_config.total_shares;
    let assets_out = compute_assets_for_shares(shares_to_burn, total_shares, total_assets_current)?;

    // ---- 4. Slippage guard — REVERSED from deposit ----
    require!(
        assets_out >= min_assets_out,
        SeedlingError::SlippageExceeded
    );
    require!(assets_out > 0, SeedlingError::BelowDustThreshold);

    // ---- 5. Redeem cTokens from Kamino ----
    // Kamino takes a `collateral_amount` (cTokens) and returns liquidity at
    // the current exchange rate. To ensure we get at least `assets_out` back,
    // we ceil the collateral amount: burning ONE EXTRA cToken if there's any
    // fractional shortfall. Vault absorbs the 1-unit overpayment.
    let collateral_to_burn: u64 = {
        // ceil(assets_out × ctoken_supply / kamino_total_liquidity)
        let num = (assets_out as u128)
            .checked_mul(collateral_supply as u128)
            .ok_or(SeedlingError::Overflow)?;
        let raw = num
            .checked_add((kamino_total_liquidity as u128).saturating_sub(1))
            .ok_or(SeedlingError::Overflow)?
            .checked_div(kamino_total_liquidity as u128)
            .ok_or(SeedlingError::DivisionByZero)?;
        let c = u64::try_from(raw).map_err(|_| SeedlingError::Overflow)?;
        // Never burn more cTokens than the vault holds.
        c.min(vault_ctokens_held)
    };

    // vault_config PDA signs the redeem CPI
    let vault_bump = [vault_config_bump];
    let signer_seeds: &[&[&[u8]]] = &[&[VaultConfig::SEED, &vault_bump]];

    {
        let mut data = DISC_REDEEM_RESERVE_COLLATERAL.to_vec();
        data.extend_from_slice(&collateral_to_burn.to_le_bytes());

        // Account order per klend handler_redeem_reserve_collateral.rs:
        //   owner, lending_market, reserve (mut), lending_market_authority,
        //   reserve_liquidity_mint, reserve_collateral_mint (mut),
        //   reserve_liquidity_supply (mut), user_source_collateral (mut),
        //   user_destination_liquidity (mut), collateral_token_program,
        //   liquidity_token_program, instruction_sysvar_account
        let ix = Instruction {
            program_id: KLEND_PROGRAM_ID,
            accounts: vec![
                AccountMeta::new_readonly(vault_config_key, true), // owner (PDA signer)
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

    // ---- 6. Transfer USDC vault → parent, PDA signs ----
    // Use the ACTUAL USDC delta Kamino returned, not the pre-computed
    // assets_out. Kamino's internal rounding may return 1-2 base units less
    // than our compute_assets_for_shares estimate; transferring assets_out
    // would overdraw by that dust. Use min(assets_out, actual_delta) so the
    // user never receives MORE than they asked for but accepts dust loss.
    let vault_usdc_post_redeem = ctx.accounts.vault_usdc_ata.amount;
    let actual_usdc_to_parent = vault_usdc_post_redeem
        .saturating_sub(vault_usdc_pre_redeem)
        .min(assets_out);
    {
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault_usdc_ata.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.parent_usdc_ata.to_account_info(),
                authority: vault_config_account_info.clone(),
            },
            signer_seeds,
        );
        transfer_checked(
            cpi_ctx,
            actual_usdc_to_parent,
            ctx.accounts.usdc_mint.decimals,
        )?;
    }
    // From here on, use `actual_usdc_to_parent` (≤ assets_out) for accounting.
    let assets_out = actual_usdc_to_parent;

    // ---- 7. Burn family shares atomically ----
    burn_family_shares(
        &mut ctx.accounts.vault_config,
        &mut ctx.accounts.family_position,
        shares_to_burn,
    )?;

    // ---- 8. Principal accounting: saturating_sub (Day-3 lock) ----
    // Per master doc §7.6: withdrawing yield above principal clamps
    // principal_remaining to 0, never negative.
    let family = &mut ctx.accounts.family_position;
    let principal_drawdown = assets_out.min(family.principal_remaining);
    let yield_drawdown = assets_out.saturating_sub(principal_drawdown);
    family.principal_remaining = family.principal_remaining.saturating_sub(assets_out);
    family.total_yield_earned = family
        .total_yield_earned
        .checked_add(yield_drawdown)
        .ok_or(SeedlingError::Overflow)?;

    // ---- 9. Update vault_config.last_known_total_assets ----
    // Withdraw removed `assets_out` from the pool (converted from cTokens).
    ctx.accounts.vault_config.last_known_total_assets = ctx
        .accounts
        .vault_config
        .last_known_total_assets
        .saturating_sub(assets_out);

    // ---- 10. Emit ----
    emit!(Withdrawn {
        family: ctx.accounts.family_position.key(),
        parent: ctx.accounts.parent.key(),
        shares_burned: shares_to_burn,
        assets_out,
        principal_drawdown,
        yield_drawdown,
        fee_to_treasury: 0, // harvest_and_fee-at-withdraw lands Day 6
        ts: Clock::get()?.unix_timestamp,
    });

    msg!("withdraw complete");
    Ok(())
}
