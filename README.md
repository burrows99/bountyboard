# BountyBoard

**Merge is payment.** Escrow USDC on a GitHub issue; it's released on-chain to the contributor's wallet the moment their claiming PR merges. No platform account, no invoice, no payout queue.

Built for Colosseum's Crypto World's Fair (Solana).

## Why

Open-source bounty platforms take a 10–20% cut, pay out days later through card rails that don't reach half the world, and are now flooded with bait listings whose money never existed. BountyBoard makes the money provable up front (it sits in escrow, visible on-chain) and the payout automatic (the maintainer's merge is the only approval).

## How it works

1. **Fund** — the maintainer posts `owner/repo#issue` + amount. BountyBoard returns a [Solana Pay](https://docs.solanapay.com) transfer request (QR / wallet link) with a unique `reference` key. Any Solana wallet pays it.
2. **Verify** — the server finds the deposit by its reference (`findReference`) and checks amount, mint and recipient (`validateTransfer`). The bounty goes `funding → open`.
3. **Claim** — a contributor opens a PR whose body contains:
   ```
   /claim #12
   wallet: <solana address>
   ```
4. **Merge = payout** — when that PR is merged, BountyBoard transfers the escrowed USDC to the wallet (`open → paid`) and links both transactions.

## Run it

```sh
npm install
solana-test-validator --quiet --ledger test-ledger   # or RPC_URL=<devnet rpc>
RPC_URL=http://127.0.0.1:8899 npm run setup          # escrow + maintainer wallets, a test-USDC mint
RPC_URL=http://127.0.0.1:8899 npm start               # http://localhost:4545 (uses `gh auth token` or GITHUB_TOKEN)
npm run pay -- "<solana: pay url>"                    # pay a bounty from the maintainer wallet (stands in for a phone wallet)
```

## Demo

The demo video is recorded end to end by [alexander](.alexander/claims/demo/bounty-paid-on-merge.claim.ts) against the real stack: a real GitHub issue and PR on [`burrows99/bountyboard-demo`](https://github.com/burrows99/bountyboard-demo), real Solana transactions, and the contributor's balance read back from the chain (0 → 50).

## Known limits (hackathon scope)

- **Custodial escrow.** Funds sit in a server-held keypair. Next: an Anchor program holding each bounty in a PDA, released by a GitHub-attested merge.
- **Polling, not webhooks.** The server polls GitHub every 3s; a webhook is the production path.
- **Test-USDC on a local validator / devnet.** Swap the mint for real USDC on mainnet.
- The maintainer's merge is the authorization: anyone can claim, but only a merged PR pays.

## License

MIT
