#![no_std]

use quasar_lang::prelude::*;

mod errors;
mod events;
mod instructions;
mod state;
mod utils;
use instructions::*;

// Test deployment address. Different from the Anchor program's
// 44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN so we don't overwrite the
// live Anchor program on devnet during validation. Final swap to the
// canonical address happens after end-to-end devnet verification.
declare_id!("975WF6vpccfi5CGoYpuaytqwwoFuZJxY2HLm5r8Dg7Zv");

#[program]
mod seedling_quasar {
    use super::*;

    #[instruction(discriminator = 0)]
    pub fn initialize_vault(
        ctx: Ctx<InitializeVault>,
        args: InitializeVaultArgs,
    ) -> Result<(), ProgramError> {
        ctx.accounts.handler(args, &ctx.bumps)
    }

    #[instruction(discriminator = 1)]
    pub fn create_family(
        ctx: Ctx<CreateFamily>,
        kid: Address,
        stream_rate: u64,
    ) -> Result<(), ProgramError> {
        ctx.accounts.handler(kid, stream_rate, &ctx.bumps)
    }

    #[instruction(discriminator = 2)]
    pub fn deposit(
        ctx: Ctx<Deposit>,
        amount: u64,
        min_shares_out: u64,
    ) -> Result<(), ProgramError> {
        ctx.accounts.handler(amount, min_shares_out)
    }

    #[instruction(discriminator = 3)]
    pub fn withdraw(
        ctx: Ctx<Withdraw>,
        shares_to_burn: u64,
        min_assets_out: u64,
    ) -> Result<(), ProgramError> {
        ctx.accounts.handler(shares_to_burn, min_assets_out)
    }

    #[instruction(discriminator = 4)]
    pub fn distribute_monthly_allowance(
        ctx: Ctx<DistributeMonthlyAllowance>,
    ) -> Result<(), ProgramError> {
        ctx.accounts.handler()
    }

    #[instruction(discriminator = 5)]
    pub fn distribute_bonus(ctx: Ctx<DistributeBonus>) -> Result<(), ProgramError> {
        ctx.accounts.handler()
    }

    #[instruction(discriminator = 6)]
    pub fn close_family(ctx: Ctx<CloseFamily>) -> Result<(), ProgramError> {
        ctx.accounts.handler()
    }

    #[instruction(discriminator = 7)]
    pub fn set_family_last_distribution(
        ctx: Ctx<SetFamilyLastDistribution>,
        new_last_distribution: i64,
    ) -> Result<(), ProgramError> {
        ctx.accounts.handler(new_last_distribution)
    }

    #[instruction(discriminator = 8)]
    pub fn roll_period(ctx: Ctx<RollPeriod>, next_period_end_ts: i64) -> Result<(), ProgramError> {
        ctx.accounts.handler(next_period_end_ts)
    }

    #[instruction(discriminator = 9)]
    pub fn set_paused(ctx: Ctx<SetPaused>, paused: bool) -> Result<(), ProgramError> {
        ctx.accounts.handler(paused)
    }
}
