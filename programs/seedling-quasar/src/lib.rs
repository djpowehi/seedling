#![no_std]

use quasar_lang::prelude::*;

mod errors;
mod events;
mod instructions;
mod state;
mod utils;
use instructions::*;

// Same program ID as the Anchor version. We deploy Quasar binary to the same
// upgradeable address; existing on-chain state will be re-init'd (per the
// "fresh init" decision on 2026-05-02).
declare_id!("44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN");

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
