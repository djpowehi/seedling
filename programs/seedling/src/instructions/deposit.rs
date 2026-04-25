use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SeedlingError;
use crate::events::Deposited;
use crate::state::{FamilyPosition, VaultConfig};
use crate::utils::{
    compute_shares_to_mint, harvest_and_fee, mint_family_shares,
};

/// Deposit USDC → vault → Kamino. Mints family shares pro-rata.
///
/// Day-3 status: instruction is fully written but the **real** Kamino CPI
/// for `refresh_reserve` + `deposit_reserve_liquidity` is stubbed (see
/// `kamino_cpi_stub_*` calls below). The Day-1 scratch test verified the
/// CPI surface against devnet from TS; Day-4 will swap these stubs for real
/// `invoke_signed` calls and run the e2e test on Surfpool mainnet-fork.
///
/// Why deferred: doing the real CPI requires either (a) klend's full IDL
/// pulled via `declare_program!` with manual fixups for Anchor 0.29→0.32
/// drift, or (b) a thin manual instruction-builder mirroring klend's discriminators.
/// Both are Day-4 work. Today's value is locking the *rest* of the deposit
/// flow — share math, fee handling, principal accounting, slippage — so
/// Day 4 only has to wire the CPI.
///
/// Today's compilation gives us a deployable, e2e-testable program that
/// works EXCEPT cTokens don't actually move in/out of Kamino. The test
/// suite reflects this: constraint failures (paused, wrong parent, amount=0,
/// slippage) are tested today; happy-path is Surfpool tomorrow.
// CONVENTION (apply to every instruction with 8+ token/mint accounts):
// Wrap heavy fields (Account<...>, InterfaceAccount<...>) in Box<>.
// Without it, Anchor's try_accounts macro overflows the SBF 4kb stack frame
// at compile time. withdraw, distribute_monthly_allowance, distribute_bonus
// all need this — they each carry the same Kamino CPI account set.
// See GOTCHAS.md #14.
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

    #[account(address = vault_config.ctoken_mint @ SeedlingError::MintMismatch)]
    pub ctoken_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Kamino reserve. Validated against the cached pubkey on VaultConfig
    /// so a malicious caller can't substitute a different reserve.
    /// CHECK: address constraint enforces it matches our cached value;
    /// downstream Kamino CPI does its own internal validation.
    #[account(
        mut,
        address = vault_config.kamino_reserve @ SeedlingError::ReserveMismatch,
    )]
    pub kamino_reserve: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn deposit_handler(
    ctx: Context<Deposit>,
    amount: u64,
    min_shares_out: u64,
) -> Result<()> {
    require!(amount > 0, SeedlingError::InvalidAmount);

    // Snapshot the bump + key BEFORE we mutably borrow vault_config.
    let vault_config_key = ctx.accounts.vault_config.key();
    let vault_config_bump = ctx.accounts.vault_config.bump;
    let vault_config_account_info = ctx.accounts.vault_config.to_account_info();

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

    // Reload to see the new vault USDC balance.
    ctx.accounts.vault_usdc_ata.reload()?;

    // ---- 2-3. Real Kamino CPI lands Day 4 (Surfpool) ----
    // refresh_reserve + deposit_reserve_liquidity stubbed here.
    // Today: assume cTokens equal USDC 1:1 (no Kamino interaction).
    // The placeholder doesn't move tokens — vault's USDC stays in vault_usdc_ata
    // until Day 4 wires the real CPI. This is intentional: it lets the constraint
    // tests pass without depending on a fake klend program.
    kamino_cpi_stub_refresh_reserve()?;

    // current_total_assets is what the vault would have on the Kamino side
    // POST-deposit. Until Day 4, we approximate it as the USDC sitting in
    // vault_usdc_ata (because we haven't actually deposited to Kamino yet).
    // After the new amount is included, we subtract it back out to compute
    // the PRE-deposit-pool size for share math.
    let total_assets_post_deposit_approx = ctx.accounts.vault_usdc_ata.amount;
    let total_assets_pre_deposit = total_assets_post_deposit_approx
        .checked_sub(amount)
        .ok_or(SeedlingError::Underflow)?;

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

    // After fee transfer, vault USDC went down by `fee_to_treasury`.
    ctx.accounts.vault_usdc_ata.reload()?;
    let total_assets_post_fee = total_assets_pre_deposit
        .checked_sub(harvest_result.fee_to_treasury)
        .ok_or(SeedlingError::Underflow)?;

    // ---- 5. (real Kamino deposit_reserve_liquidity is here in Day 4) ----
    kamino_cpi_stub_deposit_reserve_liquidity(amount)?;

    // ---- 6. Compute shares using kvault pattern ----
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

    // last_known_total_assets includes the new principal: post-fee + new amount.
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

    Ok(())
}

/// Day-3 placeholder. Day-4 replaces with real `invoke_signed` against
/// Kamino klend program ID (KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD)
/// using the account list from master doc §8.
fn kamino_cpi_stub_refresh_reserve() -> Result<()> {
    Ok(())
}

/// Day-3 placeholder. Day-4 replaces with real CPI to Kamino's
/// `deposit_reserve_liquidity(amount)`.
fn kamino_cpi_stub_deposit_reserve_liquidity(_amount: u64) -> Result<()> {
    Ok(())
}
