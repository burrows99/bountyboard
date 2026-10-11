use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Bounty amount must be greater than zero")]
    ZeroAmount,
    #[msg("Expiry must be in the future")]
    ExpiryInPast,
    #[msg("Bounty has not expired yet; only the oracle can release it")]
    NotExpired,
}
