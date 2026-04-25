use anchor_lang::prelude::*;
use anchor_lang::pubkey;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::sysvar;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SeedlingError;
use crate::events::Deposited;
use crate::state::{FamilyPosition, VaultConfig};
use crate::utils::{compute_shares_to_mint, harvest_and_fee, mint_family_shares};

/// Kamino klend program ID (mainnet + devnet). Hardcoded here for the address
/// constraint on `kamino_program`. If Kamino ever redeploys, single change.
pub const KLEND_PROGRAM_ID: Pubkey = pubkey!("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");

/// Anchor discriminators: sha256("global:<instruction_name>")[0..8].
/// Verified against klend lib.rs fn names (refresh_reserve @ line 116,
/// deposit_reserve_liquidity @ 128). Same for all future Kamino CPIs.
const DISC_REFRESH_RESERVE: [u8; 8] = [2, 218, 138, 235, 79, 201, 25, 102];
const DISC_DEPOSIT_RESERVE_LIQUIDITY: [u8; 8] = [169, 201, 30, 126, 6, 205, 102, 68];

/// Deposit USDC → vault → Kamino. Mints family shares pro-rata.
///
/// Day-4 status: real Kamino CPI live against mainnet-fork (Surfpool).
/// `refresh_reserve` + `deposit_reserve_liquidity` wired via manual
/// `invoke` / `invoke_signed` builders (no `declare_program!` dependency).
///
/// Exchange-rate computation uses Path B: `total_liquidity /
/// total_collateral_supply` from observable accounts, not Kamino's internal
/// method. Verified within 1bp of Kamino's actual rate by
/// `tests/deposit-surfpool.test.ts`.
// CONVENTION (apply to every instruction with 8+ token/mint accounts):
// Wrap heavy fields (Account<...>, InterfaceAccount<...>) in Box<>.
// Without it, Anchor's try_accounts macro overflows the SBF 4kb stack frame
// at compile time. withdraw, distribute_monthly_allowance, distribute_bonus
// all need this — they each carry the same Kamino CPI account set.
// See GOTCHAS.md #4.
#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        has_one = parent @ SeedlingError::InvalidAuthority,
    )]
    pub family_position: Box<Account<'info, FamilyPosition>>,

    #[account(mut)]
    pub parent: Signer<'info>,

    #[account(
        mut,
        constraint = parent_usdc_ata.mint == vault_config.usdc_mint @ SeedlingError::MintMismatch,
        constraint = parent_usdc_ata.owner == parent.key() @ SeedlingError::InvalidAuthority,
    )]
    pub parent_usdc_ata: Box<InterfaceAccount<'info, TokenAccount>>,

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

    // Must be mut — Kamino's deposit_reserve_liquidity mints new cTokens into it.
    #[account(mut, address = vault_config.ctoken_mint @ SeedlingError::MintMismatch)]
    pub ctoken_mint: Box<InterfaceAccount<'info, Mint>>,

    // ===== Kamino CPI accounts =====
    /// CHECK: address-validated against cached pubkey on VaultConfig.
    #[account(
        mut,
        address = vault_config.kamino_reserve @ SeedlingError::ReserveMismatch,
    )]
    pub kamino_reserve: UncheckedAccount<'info>,

    /// Kamino lending market. Not cached on VaultConfig because the klend
    /// reserve itself has `has_one = lending_market`, so a caller supplying
    /// the wrong market gets rejected inside the CPI. Defense-in-depth via
    /// klend's own constraints.
    /// CHECK: validated transitively via klend's reserve.has_one check.
    pub lending_market: UncheckedAccount<'info>,

    /// Kamino lending-market authority PDA. Derived as
    /// `[LENDING_MARKET_AUTH, lending_market]` inside klend. We pass through.
    /// CHECK: validated by klend's PDA check inside deposit_reserve_liquidity.
    /// CHECK
    pub lending_market_authority: UncheckedAccount<'info>,

    /// Kamino's USDC supply vault (where the reserve holds deposited USDC).
    /// Mutable because deposit sends USDC into it.
    /// CHECK: validated by klend's has_one-style check on
    /// `reserve.liquidity.supply_vault`.
    #[account(mut)]
    pub reserve_liquidity_supply: UncheckedAccount<'info>,

    // Oracle accounts. Kamino's klend uses Option<AccountInfo> for each of the
    // 4 oracle slots, but Anchor's Option<> encoding still requires the
    // positional account to be present — a caller signals "None" by passing
    // the klend program ID itself. We mirror that convention: always pass 4
    // oracle accounts, using KLEND_PROGRAM_ID as sentinel for unused slots.
    //
    // Validation is in the handler: when cached vault_config.oracle_X is set
    // (not KLEND_PROGRAM_ID / not default), the passed account must match.
    /// CHECK: validated in handler against vault_config.oracle_pyth.
    pub oracle_pyth: UncheckedAccount<'info>,

    /// CHECK: validated in handler.
    pub oracle_switchboard_price: UncheckedAccount<'info>,

    /// CHECK: validated in handler.
    pub oracle_switchboard_twap: UncheckedAccount<'info>,

    /// CHECK: validated in handler.
    pub oracle_scope_config: UncheckedAccount<'info>,

    /// Kamino program itself. Address-constrained to avoid the arbitrary-CPI
    /// class of vulnerability where a malicious caller substitutes a fake
    /// klend-lookalike that steals funds.
    /// CHECK: address-constrained to the known klend program ID.
    #[account(address = KLEND_PROGRAM_ID)]
    pub kamino_program: UncheckedAccount<'info>,

    /// Instruction-introspection sysvar required by klend.
    /// CHECK: sysvar ID is fixed.
    #[account(address = sysvar::instructions::ID)]
    pub instruction_sysvar: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn deposit_handler(ctx: Context<Deposit>, amount: u64, min_shares_out: u64) -> Result<()> {
    require!(amount > 0, SeedlingError::InvalidAmount);

    let vault_config_key = ctx.accounts.vault_config.key();
    let vault_config_bump = ctx.accounts.vault_config.bump;
    let vault_config_account_info = ctx.accounts.vault_config.to_account_info();
    let vault_config_oracles = (
        ctx.accounts.vault_config.oracle_pyth,
        ctx.accounts.vault_config.oracle_switchboard_price,
        ctx.accounts.vault_config.oracle_switchboard_twap,
        ctx.accounts.vault_config.oracle_scope_config,
    );

    // Oracle validation: when cached value is non-default, passed account must
    // match. For unused oracles (cached == default), accept any pubkey (caller
    // should pass klend program ID as sentinel for Kamino's Option<>).
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

    // ---- 1. Transfer USDC parent -> vault ----
    {
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.parent_usdc_ata.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.vault_usdc_ata.to_account_info(),
                authority: ctx.accounts.parent.to_account_info(),
            },
        );
        transfer_checked(cpi_ctx, amount, ctx.accounts.usdc_mint.decimals)?;
    }

    // ---- 2. Kamino refresh_reserve CPI ----
    // Anchor's Option<AccountInfo> requires every positional account to be
    // present. "None" is signaled by passing the program ID itself at the
    // slot. We always forward all 4 oracle accounts regardless of whether
    // they're configured; the caller passes klend program ID for unused.
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

        let ix = Instruction {
            program_id: KLEND_PROGRAM_ID,
            accounts: metas,
            data: DISC_REFRESH_RESERVE.to_vec(),
        };
        invoke(&ix, &infos)?;
    }

    // Reload the reserve AND supply vault to see post-refresh state.
    // Kamino's refresh updates the reserve's market_price_sf / interest state;
    // we read the supply vault for Path-B exchange-rate math below.
    ctx.accounts.vault_usdc_ata.reload()?;
    ctx.accounts.vault_ctoken_ata.reload()?;

    // ---- 3. Compute total_assets PRE-deposit via Path B ----
    // Path B: exchange_rate = liquidity_supply / collateral_supply (both in
    // base units). Our USDC-equivalent holdings =
    //   cTokens_held × (liquidity_supply / collateral_supply)
    // =cTokens_held × liquidity_supply / collateral_supply.
    //
    // Read liquidity supply and collateral mint supply directly from chain.
    // Avoids deserializing klend's 8624-byte Reserve struct.
    let reserve_liquidity_supply_info = &ctx.accounts.reserve_liquidity_supply;
    let reserve_liquidity_supply_data = reserve_liquidity_supply_info.try_borrow_data()?;
    // SPL TokenAccount layout: amount at offset 64, 8 bytes LE u64.
    require!(
        reserve_liquidity_supply_data.len() >= 72,
        SeedlingError::InvalidAccountState
    );
    let reserve_liquidity_amount = u64::from_le_bytes(
        reserve_liquidity_supply_data[64..72]
            .try_into()
            .map_err(|_| SeedlingError::InvalidAccountState)?,
    );
    drop(reserve_liquidity_supply_data);

    let collateral_supply = ctx.accounts.ctoken_mint.supply;
    let vault_ctokens_held = ctx.accounts.vault_ctoken_ata.amount;

    // Pre-deposit total assets: cTokens_held × liquidity / collateral_supply.
    // If we hold zero cTokens or the reserve has no liquidity, total is 0.
    let total_assets_pre_deposit: u64 = if vault_ctokens_held == 0 || collateral_supply == 0 {
        0
    } else {
        let prod = (vault_ctokens_held as u128)
            .checked_mul(reserve_liquidity_amount as u128)
            .ok_or(SeedlingError::Overflow)?;
        let assets = prod
            .checked_div(collateral_supply as u128)
            .ok_or(SeedlingError::DivisionByZero)?;
        u64::try_from(assets).map_err(|_| SeedlingError::Overflow)?
    };

    // ---- 4. Harvest and fee BEFORE share math ----
    let harvest_result = {
        let vault_config = &mut ctx.accounts.vault_config;
        harvest_and_fee(
            vault_config,
            vault_config_key,
            vault_config_bump,
            total_assets_pre_deposit,
            &ctx.accounts.vault_usdc_ata,
            &ctx.accounts.treasury_usdc_ata,
            &ctx.accounts.usdc_mint,
            vault_config_account_info.clone(),
            &ctx.accounts.token_program,
        )?
    };
    ctx.accounts.vault_usdc_ata.reload()?;
    let total_assets_post_fee = total_assets_pre_deposit
        .checked_sub(harvest_result.fee_to_treasury)
        .ok_or(SeedlingError::Underflow)?;

    // ---- 5. Kamino deposit_reserve_liquidity CPI ----
    // 12 accounts per master doc §8 + handler_deposit_reserve_liquidity.rs.
    // Account order must match klend's DepositReserveLiquidity struct:
    //   owner, reserve, lending_market, lending_market_authority,
    //   reserve_liquidity_mint, reserve_liquidity_supply,
    //   reserve_collateral_mint, user_source_liquidity,
    //   user_destination_collateral, collateral_token_program (SPL Token),
    //   liquidity_token_program (TokenInterface), instruction_sysvar.
    //
    // vault_config is owner + signer via PDA seeds.
    {
        let vault_bump = [vault_config_bump];
        let signer_seeds: &[&[&[u8]]] = &[&[VaultConfig::SEED, &vault_bump]];

        let mut data = DISC_DEPOSIT_RESERVE_LIQUIDITY.to_vec();
        data.extend_from_slice(&amount.to_le_bytes());

        let ix = Instruction {
            program_id: KLEND_PROGRAM_ID,
            accounts: vec![
                AccountMeta::new_readonly(vault_config_key, true), // owner (PDA signer)
                AccountMeta::new(ctx.accounts.kamino_reserve.key(), false),
                AccountMeta::new_readonly(ctx.accounts.lending_market.key(), false),
                AccountMeta::new_readonly(ctx.accounts.lending_market_authority.key(), false),
                AccountMeta::new_readonly(ctx.accounts.usdc_mint.key(), false),
                AccountMeta::new(ctx.accounts.reserve_liquidity_supply.key(), false),
                AccountMeta::new(ctx.accounts.ctoken_mint.key(), false),
                AccountMeta::new(ctx.accounts.vault_usdc_ata.key(), false),
                AccountMeta::new(ctx.accounts.vault_ctoken_ata.key(), false),
                AccountMeta::new_readonly(anchor_spl::token::ID, false),
                AccountMeta::new_readonly(ctx.accounts.token_program.key(), false),
                AccountMeta::new_readonly(ctx.accounts.instruction_sysvar.key(), false),
            ],
            data,
        };

        let infos: &[AccountInfo] = &[
            vault_config_account_info.clone(),
            ctx.accounts.kamino_reserve.to_account_info(),
            ctx.accounts.lending_market.to_account_info(),
            ctx.accounts.lending_market_authority.to_account_info(),
            ctx.accounts.usdc_mint.to_account_info(),
            ctx.accounts.reserve_liquidity_supply.to_account_info(),
            ctx.accounts.ctoken_mint.to_account_info(),
            ctx.accounts.vault_usdc_ata.to_account_info(),
            ctx.accounts.vault_ctoken_ata.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            ctx.accounts.instruction_sysvar.to_account_info(),
        ];
        invoke_signed(&ix, infos, signer_seeds)?;
    }

    // Reload to see cTokens minted + USDC moved into Kamino.
    ctx.accounts.vault_ctoken_ata.reload()?;
    ctx.accounts.vault_usdc_ata.reload()?;

    // ---- 6. Shares math (kvault pattern, Path A for first-depositor) ----
    let shares_to_mint = compute_shares_to_mint(
        amount,
        ctx.accounts.vault_config.total_shares,
        total_assets_post_fee,
    )?;

    // ---- 7. Slippage guard ----
    require!(
        shares_to_mint >= min_shares_out,
        SeedlingError::SlippageExceeded
    );

    // ---- 8-9. Atomic mint + principal update ----
    mint_family_shares(
        &mut ctx.accounts.vault_config,
        &mut ctx.accounts.family_position,
        shares_to_mint,
    )?;

    let family = &mut ctx.accounts.family_position;
    family.principal_deposited = family
        .principal_deposited
        .checked_add(amount)
        .ok_or(SeedlingError::Overflow)?;
    family.principal_remaining = family
        .principal_remaining
        .checked_add(amount)
        .ok_or(SeedlingError::Overflow)?;

    ctx.accounts.vault_config.last_known_total_assets = total_assets_post_fee
        .checked_add(amount)
        .ok_or(SeedlingError::Overflow)?;

    // ---- 10. Emit ----
    emit!(Deposited {
        family: ctx.accounts.family_position.key(),
        parent: ctx.accounts.parent.key(),
        amount,
        shares_minted: shares_to_mint,
        fee_to_treasury: harvest_result.fee_to_treasury,
        ts: Clock::get()?.unix_timestamp,
    });

    msg!("deposit complete");
    Ok(())
}
