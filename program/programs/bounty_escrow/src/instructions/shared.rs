use anchor_lang::prelude::*;

use anchor_spl::token_interface::{
    close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface,
    TransferChecked,
};

use crate::Bounty;

pub fn transfer_tokens<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    amount: &u64,
    mint: &InterfaceAccount<'info, Mint>,
    authority: &Signer<'info>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    let transfer_accounts = TransferChecked {
        from: from.to_account_info(),
        mint: mint.to_account_info(),
        to: to.to_account_info(),
        authority: authority.to_account_info(),
    };

    let cpi_context = CpiContext::new(token_program.key(), transfer_accounts);

    transfer_checked(cpi_context, *amount, mint.decimals)
}

/// Send everything in `vault` to `to`, signed by the bounty PDA, then close the vault
/// (its rent goes to `rent_to`). Shared by `release` and `refund`.
pub fn pay_out_and_close_vault<'info>(
    bounty: &Account<'info, Bounty>,
    vault: &InterfaceAccount<'info, TokenAccount>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    rent_to: &AccountInfo<'info>,
    token_program: &Interface<'info, TokenInterface>,
) -> Result<()> {
    let id = bounty.id.to_le_bytes();
    let seeds = &[b"bounty", bounty.maintainer.as_ref(), &id[..], &[bounty.bump]];
    let signer_seeds = [&seeds[..]];

    transfer_checked(
        CpiContext::new_with_signer(
            token_program.key(),
            TransferChecked {
                from: vault.to_account_info(),
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: bounty.to_account_info(),
            },
            &signer_seeds,
        ),
        vault.amount,
        mint.decimals,
    )?;

    close_account(CpiContext::new_with_signer(
        token_program.key(),
        CloseAccount {
            account: vault.to_account_info(),
            destination: rent_to.clone(),
            authority: bounty.to_account_info(),
        },
        &signer_seeds,
    ))
}
