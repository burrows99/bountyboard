pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("76YvPrU9L4wwy5c4zWAMZV3cXu9WMazB55NeJ9nym3o");

/// BountyBoard escrow: USDC locked per GitHub issue, released to the contributor when
/// the oracle sees the claiming PR merge, refundable to the maintainer only after expiry.
#[program]
pub mod bounty_escrow {
    use super::*;

    pub fn fund_bounty(ctx: Context<FundBounty>, id: u64, amount: u64, expires_at: i64) -> Result<()> {
        instructions::fund_bounty::fund_bounty(ctx, id, amount, expires_at)
    }

    pub fn release(ctx: Context<Release>) -> Result<()> {
        instructions::release::release(ctx)
    }

    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        instructions::refund::refund(ctx)
    }
}
