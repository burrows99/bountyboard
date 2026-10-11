use anchor_lang::prelude::*;

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::Bounty;

use super::pay_out_and_close_vault;

// Adapted from program-examples `take_offer`: the oracle (which saw the claiming PR merge)
// sends the whole vault to the contributor. Rent goes back to the maintainer who paid it.
#[derive(Accounts)]
pub struct Release<'info> {
    #[account(mut)]
    pub oracle: Signer<'info>,

    /// CHECK: the wallet named in the merged PR; it only receives tokens.
    pub contributor: UncheckedAccount<'info>,

    #[account(mut)]
    pub maintainer: SystemAccount<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init_if_needed,
        payer = oracle,
        associated_token::mint = mint,
        associated_token::authority = contributor,
        associated_token::token_program = token_program,
    )]
    pub contributor_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        close = maintainer,
        has_one = oracle,
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

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn release(ctx: Context<Release>) -> Result<()> {
    let a = &ctx.accounts;
    pay_out_and_close_vault(
        &a.bounty,
        &a.vault,
        &a.mint,
        &a.contributor_token_account,
        &a.maintainer.to_account_info(),
        &a.token_program,
    )
}
