# BountyBoard

**The payment rail for open-source work — by humans or AI agents. Merge is payment.**

Coding agents now open real pull requests. They can't hold a bank account, but they can hold a Solana wallet. BountyBoard lets a maintainer lock stablecoins against a GitHub issue in an on-chain escrow program; whoever's PR closes it — a person or an agent — is paid the moment it merges.

Built for Colosseum's Crypto World's Fair (Solana).

https://github.com/user-attachments/assets/239e7d8e-a857-40d5-afcd-f8ba96172ad8

*2:20, narrated, on **Solana devnet**: a maintainer escrows 50 USDC → **Claude Code, running headless with its own wallet, fixes the issue and opens the PR** → the maintainer merges → the program pays the agent. GitHub, the board and Solana Explorer are on screen together, and every wallet's balance is read from chain at each step (maintainer −50, vault 0 → 50 → closed, agent 0 → 50).*

## Why

Bounty platforms take 10–20%, pay out days later on card rails that don't reach half the world, and are full of bait listings whose money never existed — and none of them can pay an AI agent at all. BountyBoard makes the money **provable before work starts** (it sits in a program-owned vault, visible on Explorer) and the payout **instant, global and agent-native** (a wallet address in the PR is the whole onboarding).

## How it works

1. **Fund** — the maintainer posts `owner/repo#issue` + amount and signs a `fund_bounty` transaction, served as a **Solana Pay transaction request** that is also a **Solana Action (Blink)** — fund from any wallet, or straight from a post on X.
2. **Escrow** — the [`bounty_escrow`](program/programs/bounty_escrow/src) program moves the tokens into a vault owned by a per-bounty PDA. Only two exits exist:
   - `release` — callable only by the merge oracle, pays the **whole** vault to the contributor and closes it;
   - `refund` — callable only by the maintainer, and only **after expiry** (default 30 days), so contributors can't be rug-pulled mid-work.
3. **Claim** — the contributor's PR body contains `/claim #N` and `wallet: <address>`.
4. **Merge = payout** — when that PR merges (and only a PR merged *after* the bounty was posted), the oracle calls `release`.

Works with any SPL stablecoin — classic Token (USDC) and Token-2022 (e.g. PYUSD) — tested both.

**Devnet program:** [`76YvPrU9L4wwy5c4zWAMZV3cXu9WMazB55NeJ9nym3o`](https://explorer.solana.com/address/76YvPrU9L4wwy5c4zWAMZV3cXu9WMazB55NeJ9nym3o?cluster=devnet)

## Tested guarantees

`npm test` runs against a live cluster (local validator or devnet) and passes on both:

```
✓ a key that is not the oracle cannot release
✓ maintainer cannot refund before expiry
✓ release pays the contributor 10 and closes the bounty
✓ maintainer is refunded after expiry
✓ a Token-2022 stablecoin escrows and pays out 7
```

The demo video is itself an automated end-to-end test ([spec](.alexander/claims/demo/bounty-paid-on-merge.claim.ts), recorded with alexander): it fails if any balance moves by the wrong amount, if money moves before the merge, or if the agent doesn't open a PR.

## Business

- **Who pays:** OSS companies, DAOs and protocol teams already funding bounties and grants — and, increasingly, teams dispatching AI agents at their backlog.
- **Revenue:** 2% taken at payout (vs 10–20% today), only when work merges. Later: a hosted GitHub App (webhooks, org budgets, private repos) on subscription.
- **Why now:** agents are starting to do paid work and need a payment rail that doesn't require a bank or KYC'd human; stablecoins on Solana make a seconds-fast, sub-cent global payout trivial.
- **For Solana:** every bounty brings a developer — or an agent — to its first wallet and first USDC, paid for real work.

## Run it

```sh
# build the program with the Solana Foundation's Anchor image
docker compose run --rm program

# run the board against devnet (a GitHub token that can read your repos)
GITHUB_TOKEN=... docker compose up app        # http://localhost:4545
```

Or natively: `npm install`, `RPC_URL=https://api.devnet.solana.com npm run setup` (wallets + a test-USDC mint), `npm start`, `npm test`.

## Built from

- Escrow program adapted from the Solana Foundation's [`program-examples/tokens/escrow/anchor`](https://github.com/solana-developers/program-examples/tree/main/tokens/escrow/anchor) (Anchor 1.0.2).
- Official clients only: `@anchor-lang/core`, `@solana/web3.js`, `@solana/spl-token`, `@solana/pay`, `@solana/actions`.

## Known limits (hackathon scope)

- **The oracle is trusted to report merges honestly.** It can only send funds to a claimant, never back to itself; next step is a GitHub App webhook plus an attestation (e.g. signed merge event) the program verifies.
- **Polling, not webhooks** (3 s) for now.
- **Test-USDC on devnet.** Swap the mint for real USDC/PYUSD on mainnet.

## License

MIT
