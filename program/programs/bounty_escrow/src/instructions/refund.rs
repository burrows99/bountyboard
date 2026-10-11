use anchor_lang::prelude::*;

use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};

use crate::{error::ErrorCode, Bounty};

use super::pay_out_and_close_vault;

// Adapted from program-examples `refund_offer`, with one change: the maintainer can only
// take the money back after expiry, so a contributor can't be rug-pulled mid-work.
#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(mut)]
    pub maintainer: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = maintainer,
        associated_token::token_program = token_program,
    )]
    pub maintainer_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        close = maintainer,
        has_one = maintainer,
        has_one = mint,
        seeds = [b"bounty", maintainer.key().as_ref(), bounty.id.to_le_bytes().as_ref()],
        bump = bounty.bump
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = bounty,
        associated_token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn refund(ctx: Context<Refund>) -> Result<()> {
    require!(
        Clock::get()?.unix_timestamp >= ctx.accounts.bounty.expires_at,
        ErrorCode::NotExpired
    );
    let a = &ctx.accounts;
    pay_out_and_close_vault(
        &a.bounty,
        &a.vault,
        &a.mint,
        &a.maintainer_token_account,
        &a.maintainer.to_account_info(),
        &a.token_program,
    )
}
