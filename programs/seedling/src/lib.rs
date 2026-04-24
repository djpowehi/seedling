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
}
