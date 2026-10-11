use anchor_lang::prelude::*;

/// One bounty: `amount` of `mint` held in a vault owned by this account until
/// the `oracle` attests the claiming PR merged, or the maintainer refunds after `expires_at`.
#[account]
#[derive(InitSpace)]
pub struct Bounty {
    pub id: u64,
    pub maintainer: Pubkey,
    pub oracle: Pubkey,
    pub mint: Pubkey,
    pub amount: u64,
    pub expires_at: i64,
    pub bump: u8,
}
