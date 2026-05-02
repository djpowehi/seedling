#![no_std]

use quasar_lang::prelude::*;

mod errors;
mod instructions;
mod state;
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
}
