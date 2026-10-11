// A USDC bounty escrowed on a GitHub issue is paid on-chain to the contributor's wallet the moment their claiming PR merges.
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { claim } from "../../recipes/project.ts";

const ROOT = new URL("../../../", import.meta.url).pathname;
const REPO = "burrows99/bountyboard-demo";
const AMOUNT = 50;
const sh = (cmd: string, cwd = ROOT) => execSync(cmd, { cwd, encoding: "utf8" }).trim();
const chain = new Connection("http://127.0.0.1:8899", "confirmed");
const MINT = new PublicKey(readFileSync(join(ROOT, ".data/mint.txt"), "utf8").trim());
const contributor = Keypair.generate(); // a brand-new wallet: its balance must go 0 → AMOUNT
const short = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

async function balance() {
  const ata = getAssociatedTokenAddressSync(MINT, contributor.publicKey);
  return chain.getTokenAccountBalance(ata).then(b => b.value.uiAmount ?? 0, () => 0);
}

const newest = (status: string) => `[data-testid=bounty]:first-child[data-status=${status}]`;

export default claim({
  steps: () => [
    // The issue a maintainer wants fixed — a fresh one per run.
    s => {
      const url = sh(`gh issue create -R ${REPO} --title "Add a CHANGELOG" --body "Start a CHANGELOG.md. 💰 Bounty on BountyBoard."`);
      s.vars.issueUrl = url;
      s.vars.issue = Number(url.split("/").pop());
    },
    s => s.github.login(new URL(s.vars.issueUrl as string).pathname),
    s => s.say("Open source maintainers want issues fixed, and contributors want to be paid. Today that means invoices, platforms, and waiting. Here is an issue that needs doing.", s.github),

    s => s.web.login("/"),
    s => s.say("This is BountyBoard. The maintainer puts fifty USDC on that issue, in escrow on Solana."),
    s => s.web.fill("owner/repo", REPO),
    s => s.web.fill("Issue #", String(s.vars.issue)),
    s => s.web.fill("USDC", String(AMOUNT)),
    s => s.web.click("Post bounty"),
    s => s.web.seeSelector(newest("funding")),
    s => s.web.ring(`${newest("funding")} .qr`, "Solana Pay request", "neutral"),
    s => s.say("BountyBoard returns a Solana Pay request. The maintainer scans it with any Solana wallet."),
    s => s.web.unring(),

    // The maintainer's wallet pays the exact Solana Pay URL shown on screen.
    async s => {
      const payUrl = await s.web.attr(`${newest("funding")} [data-testid=pay-url]`, "href");
      sh(`RPC_URL=http://127.0.0.1:8899 npx tsx scripts/pay.ts "${payUrl}"`);
    },
    s => s.web.seeSelector(newest("open"), 20_000),
    s => s.web.ring(`${newest("open")} [data-testid=fund-tx]`, "deposit confirmed on-chain", "good"),
    s => s.say("The deposit is found on-chain by its reference key and verified. The bounty is now open, and the money is provably there."),
    s => s.web.unring(),

    // A contributor does the work and claims it in the PR body.
    async s => {
      s.vars.before = await balance();
      const dir = mkdtempSync(join(tmpdir(), "bb-"));
      sh(`gh repo clone ${REPO} . -- -q`, dir);
      sh(`git checkout -qb changelog-${s.vars.issue} && printf -- '- Bounty #${s.vars.issue} delivered\\n' >> CHANGELOG.md && git add . && git commit -qm "Add CHANGELOG" && git push -q -u origin HEAD`, dir);
      s.vars.pr = sh(`gh pr create -R ${REPO} --head changelog-${s.vars.issue} --title "Add CHANGELOG.md" --body "Closes #${s.vars.issue}\n\n/claim #${s.vars.issue}\nwallet: ${contributor.publicKey.toBase58()}"`, dir);
    },
    s => s.github.goto(s.vars.pr as string),
    s => s.github.ring(`/claim #${s.vars.issue}`, "the claim + payout wallet", "neutral"),
    s => s.say("A contributor opens a pull request. Two lines claim the bounty: slash claim, and the wallet to be paid. No sign up, no invoice.", s.github),
    s => s.github.panel("Contributor wallet — before merge", {
      wallet: short(contributor.publicKey.toBase58()),
      "USDC balance": s.vars.before,
    }),

    // The maintainer merges in GitHub's own UI — on camera, before the board can react.
    s => s.github.unring(),
    s => s.github.click("Squash and merge"),
    s => s.say("The maintainer reviews and merges. That is the only approval there is. Watch the board on the right.", s.github),
    s => s.github.click("Confirm squash and merge"),
    s => s.github.see("Merged", 20_000),

    s => s.web.goto("/"),
    s => s.web.seeSelector(newest("paid"), 30_000),
    s => s.web.ring(`${newest("paid")} [data-testid=payout-tx]`, "paid on merge", "good"),
    async s => {
      s.vars.after = await balance();
      if (s.vars.after !== AMOUNT) throw new Error(`contributor holds ${s.vars.after} USDC, expected ${AMOUNT}`);
    },
    s => s.web.panel("Contributor wallet — after merge (read from chain)", {
      wallet: short(contributor.publicKey.toBase58()),
      "USDC balance": `${s.vars.before} → ${s.vars.after}`,
    }),
    s => s.say("The board saw the merge, often before GitHub's own page has refreshed, and released the escrow. The contributor's wallet went from zero to fifty USDC, read straight from the chain. Merge is payment."),
  ],
});
