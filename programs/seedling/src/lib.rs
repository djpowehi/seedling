use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;
pub mod utils;

use instructions::*;

declare_id!("E4r6K73vj9HCJxs4ZogAZ1FUSyDufM9ovjApah25qXfA");

#[program]
pub mod seedling {
    use super::*;

    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        args: InitializeVaultArgs,
    ) -> Result<()> {
        instructions::initialize_vault_handler(ctx, args)
    }

    pub fn create_family(ctx: Context<CreateFamily>, kid: Pubkey, stream_rate: u64) -> Result<()> {
        instructions::create_family_handler(ctx, kid, stream_rate)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64, min_shares_out: u64) -> Result<()> {
        instructions::deposit_handler(ctx, amount, min_shares_out)
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        shares_to_burn: u64,
        min_assets_out: u64,
    ) -> Result<()> {
        instructions::withdraw_handler(ctx, shares_to_burn, min_assets_out)
    }

    pub fn set_family_last_distribution(
        ctx: Context<SetFamilyLastDistribution>,
        new_last_distribution: i64,
    ) -> Result<()> {
        instructions::set_family_last_distribution_handler(ctx, new_last_distribution)
    }

    pub fn distribute_monthly_allowance(ctx: Context<DistributeMonthlyAllowance>) -> Result<()> {
        instructions::distribute_monthly_allowance_handler(ctx)
    }
}
