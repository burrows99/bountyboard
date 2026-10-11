use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{error::ErrorCode, Bounty, ANCHOR_DISCRIMINATOR};

use super::transfer_tokens;

// Adapted from solana-developers/program-examples tokens/escrow/anchor `make_offer`.
#[derive(Accounts)]
#[instruction(id: u64)]
pub struct FundBounty<'info> {
    #[account(mut)]
    pub maintainer: Signer<'info>,

    /// CHECK: only stored; it is the key allowed to `release` (BountyBoard's merge attester).
    pub oracle: UncheckedAccount<'info>,

    #[account(mint::token_program = token_program)]
    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = maintainer,
        associated_token::token_program = token_program
    )]
    pub maintainer_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = maintainer,
        space = ANCHOR_DISCRIMINATOR + Bounty::INIT_SPACE,
        seeds = [b"bounty", maintainer.key().as_ref(), id.to_le_bytes().as_ref()],
        bump
    )]
    pub bounty: Account<'info, Bounty>,

    #[account(
        init,
        payer = maintainer,
        associated_token::mint = mint,
        associated_token::authority = bounty,
        associated_token::token_program = token_program
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn fund_bounty(ctx: Context<FundBounty>, id: u64, amount: u64, expires_at: i64) -> Result<()> {
    require!(amount > 0, ErrorCode::ZeroAmount);
    require!(expires_at > Clock::get()?.unix_timestamp, ErrorCode::ExpiryInPast);

    transfer_tokens(
        &ctx.accounts.maintainer_token_account,
        &ctx.accounts.vault,
        &amount,
        &ctx.accounts.mint,
        &ctx.accounts.maintainer,
        &ctx.accounts.token_program,
    )?;

    ctx.accounts.bounty.set_inner(Bounty {
        id,
        maintainer: ctx.accounts.maintainer.key(),
        oracle: ctx.accounts.oracle.key(),
        mint: ctx.accounts.mint.key(),
        amount,
        expires_at,
        bump: ctx.bumps.bounty,
    });
    Ok(())
}
