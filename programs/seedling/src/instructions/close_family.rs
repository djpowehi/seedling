use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_lang::solana_program::program::{invoke, invoke_signed};
use anchor_lang::solana_program::sysvar;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token_interface::{
    transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked,
};

use crate::errors::SeedlingError;
use crate::events::FamilyClosed;
use crate::instructions::deposit::KLEND_PROGRAM_ID;
use crate::state::{FamilyPosition, KidView, VaultConfig};
use crate::utils::{burn_family_shares, compute_assets_for_shares};

const DISC_REFRESH_RESERVE: [u8; 8] = [2, 218, 138, 235, 79, 201, 25, 102];
const DISC_REDEEM_RESERVE_COLLATERAL: [u8; 8] = [234, 117, 181, 125, 185, 142, 220, 29];

/// Close a family. Redeems any remaining shares for USDC → parent, then
/// closes both `family_position` and `kid_view` PDAs (rent → parent).
///
/// Two paths:
/// - **Empty family** (`shares == 0`): skips Kamino entirely. Just closes
///   PDAs. Always allowed (even when paused) — parent never gets trapped.
/// - **Non-empty family** (`shares > 0`): runs the same redeem flow as
///   `withdraw`, transfers full USDC payout to parent, burns shares, then
///   closes PDAs. Requires vault not paused (matches withdraw).
///
/// Anchor's `close = parent` constraint zeroes account data and refunds
/// lamports automatically once the handler returns Ok.
// CONVENTION: Box<> every heavy field. See GOTCHAS.md #4.
#[derive(Accounts)]
pub struct CloseFamily<'info> {
    #[account(
        mut,
        close = parent,
        has_one = parent @ SeedlingError::InvalidAuthority,
    )]
    pub family_position: Box<Account<'info, FamilyPosition>>,

    /// Kid's view PDA. Closed alongside family_position so rent is fully
    /// refunded to the parent. Constrained via seed derivation against the
    /// stored bump.
    #[account(
        mut,
        close = parent,
        seeds = [KidView::SEED_PREFIX, parent.key().as_ref(), family_position.kid.as_ref()],
        bump = kid_view.bump,
    )]
    pub kid_view: Box<Account<'info, KidView>>,

    #[account(mut)]
    pub parent: Signer<'info>,

    /// Destination for redeemed USDC. Owned by parent. Must exist if
    /// shares > 0 (caller is responsible — frontend uses the idempotent
    /// ATA helper to ensure it does).
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
    )]
    pub vault_config: Box<Account<'info, VaultConfig>>,

    #[account(address = vault_config.usdc_mint @ SeedlingError::MintMismatch)]
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(mut, address = vault_config.ctoken_mint @ SeedlingError::MintMismatch)]
    pub ctoken_mint: Box<InterfaceAccount<'info, Mint>>,

    // ===== Kamino CPI accounts (only used when shares > 0) =====
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

    /// CHECK: validated by klend's has_one-style check.
    #[account(mut)]
    pub reserve_liquidity_supply: UncheckedAccount<'info>,

    /// CHECK: validated against cached oracle in handler.
    pub oracle_pyth: UncheckedAccount<'info>,
    /// CHECK: validated against cached oracle in handler.
    pub oracle_switchboard_price: UncheckedAccount<'info>,
    /// CHECK: validated against cached oracle in handler.
    pub oracle_switchboard_twap: UncheckedAccount<'info>,
    /// CHECK: validated against cached oracle in handler.
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

pub fn close_family_handler(ctx: Context<CloseFamily>) -> Result<()> {
    let shares_to_redeem = ctx.accounts.family_position.shares;
    let family_key = ctx.accounts.family_position.key();
    let kid = ctx.accounts.family_position.kid;
    let parent_key = ctx.accounts.parent.key();
    let principal_returned_via_redeem;
    let yield_returned_via_redeem;
    let assets_paid_out;

    if shares_to_redeem == 0 {
        // Empty family — skip Kamino entirely. PDAs close automatically
        // via Anchor's `close = parent` constraint.
        principal_returned_via_redeem = 0;
        yield_returned_via_redeem = 0;
        assets_paid_out = 0;
    } else {
        // Non-empty family. Vault must not be paused for the Kamino flow.
        require!(
            !ctx.accounts.vault_config.is_paused,
            SeedlingError::VaultPaused
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

        // ---- 1. refresh_reserve ----
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

        // ---- 2. Path B total_assets ----
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

        // ---- 3. Compute USDC owed for ALL the family's shares ----
        let total_shares = ctx.accounts.vault_config.total_shares;
        let assets_out =
            compute_assets_for_shares(shares_to_redeem, total_shares, total_assets_current)?;
        require!(assets_out > 0, SeedlingError::BelowDustThreshold);

        // ---- 4. Redeem cTokens from Kamino ----
        let collateral_to_burn: u64 = {
            let num = (assets_out as u128)
                .checked_mul(collateral_supply as u128)
                .ok_or(SeedlingError::Overflow)?;
            let raw = num
                .checked_add((kamino_total_liquidity as u128).saturating_sub(1))
                .ok_or(SeedlingError::Overflow)?
                .checked_div(kamino_total_liquidity as u128)
                .ok_or(SeedlingError::DivisionByZero)?;
            let c = u64::try_from(raw).map_err(|_| SeedlingError::Overflow)?;
            c.min(vault_ctokens_held)
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
        let actual_to_parent = vault_usdc_post_redeem
            .saturating_sub(vault_usdc_pre_redeem)
            .min(assets_out);

        // ---- 5. SPL transfer vault → parent ----
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
            transfer_checked(cpi_ctx, actual_to_parent, ctx.accounts.usdc_mint.decimals)?;
        }

        // ---- 6. Burn the family's shares (atomic with vault total) ----
        burn_family_shares(
            &mut ctx.accounts.vault_config,
            &mut ctx.accounts.family_position,
            shares_to_redeem,
        )?;

        // ---- 7. Accounting split: principal vs yield ----
        let family = &mut ctx.accounts.family_position;
        let principal_drawdown = actual_to_parent.min(family.principal_remaining);
        let yield_drawdown = actual_to_parent.saturating_sub(principal_drawdown);
        family.principal_remaining = family.principal_remaining.saturating_sub(actual_to_parent);
        family.total_yield_earned = family
            .total_yield_earned
            .checked_add(yield_drawdown)
            .ok_or(SeedlingError::Overflow)?;

        ctx.accounts.vault_config.last_known_total_assets = ctx
            .accounts
            .vault_config
            .last_known_total_assets
            .saturating_sub(actual_to_parent);

        principal_returned_via_redeem = principal_drawdown;
        yield_returned_via_redeem = yield_drawdown;
        assets_paid_out = actual_to_parent;
    }

    emit!(FamilyClosed {
        family: family_key,
        parent: parent_key,
        kid,
        shares_redeemed: shares_to_redeem,
        assets_paid_out,
        principal_returned: principal_returned_via_redeem,
        yield_returned: yield_returned_via_redeem,
        ts: Clock::get()?.unix_timestamp,
    });

    msg!("close_family complete");
    Ok(())
}
