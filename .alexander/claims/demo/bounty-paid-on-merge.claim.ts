// A USDC bounty escrowed on-chain against a GitHub issue is paid to the AI agent whose PR closes it, the moment that PR merges.
import { exec, execSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { connection, keypair, mint } from "../../../src/solana.ts";
import { Escrow } from "../../../src/escrow.ts";
import { claim } from "../../recipes/project.ts";

const ROOT = new URL("../../../", import.meta.url).pathname;
const REPO = "burrows99/bountyboard-demo";
const AMOUNT = 50;
const MINT = mint(); // devnet test-USDC
const escrow = new Escrow(keypair("oracle"), MINT);
const maintainer = keypair("maintainer").publicKey;
const agent = Keypair.generate().publicKey; // the coding agent's own wallet, new each run so its balance starts at 0
const sh = (cmd: string, cwd = ROOT) => execSync(cmd, { cwd, encoding: "utf8" }).trim();
const short = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;
const devnet = (path: string) => `${path}?cluster=devnet`;

const tokens = (account: PublicKey) =>
  connection.getTokenAccountBalance(account, "confirmed").then(b => b.value.uiAmount ?? 0, () => null); // null = account closed
const ata = (owner: PublicKey) => getAssociatedTokenAddressSync(MINT, owner);

/** Every wallet the bounty touches, read from chain: compared as a whole set, before vs after. */
async function ledger(s: any) {
  const vault = s.vars.bounty ? await tokens(escrow.vaultAddress(new PublicKey(s.vars.bounty))) : undefined;
  return { maintainer: await tokens(ata(maintainer)) ?? 0, vault, agent: await tokens(ata(agent)) ?? 0 };
}
const fmt = (l: { maintainer: number; vault?: number | null; agent: number }) => ({
  [`maintainer ${short(maintainer.toBase58())}`]: `${l.maintainer} USDC`,
  "escrow vault": l.vault === undefined ? "not created yet" : l.vault === null ? "closed (account deleted)" : `${l.vault} USDC`,
  [`agent ${short(agent.toBase58())}`]: `${l.agent} USDC`,
});

const newest = (status: string) => `[data-testid=bounty]:first-child[data-status=${status}]`;

export default claim({
  steps: () => [
    // ── The work: a fresh issue per run ─────────────────────────────────────────
    s => {
      // A task that is new every run, so a previous run's merge can't already have done it.
      const topic = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      const url = sh(`gh issue create -R ${REPO} --title "Docs: add docs/faq-${topic}.md" --body "Add docs/faq-${topic}.md answering two questions in Markdown: how do I claim a bounty on this repo, and when do I get paid? 💰 Bounty on BountyBoard — humans and AI agents welcome."`);
      s.vars.issueUrl = url;
      s.vars.issue = Number(url.split("/").pop());
    },
    s => s.github.login(new URL(s.vars.issueUrl as string).pathname),
    s => s.web.login("/"),
    s => s.explorer.login(devnet(`/address/${escrow.program.programId.toBase58()}`)),
    s => s.explorer.see("Program", 30_000),
    // Explorer's cookie banner shows only sometimes: when it does, decline it and keep the pane clear.
    async s => { if (await s.explorer.count("text=/^opt-out$/i")) await s.explorer.click("OPT-OUT"); },
    s => s.github.ring("💰 Bounty on BountyBoard", "the work", "neutral"),
    s => s.say("Coding agents now open real pull requests. They can't hold a bank account, but they can hold a Solana wallet. Top left, an open issue. Top right, BountyBoard. Below, its escrow program in Solana Explorer, live on devnet.", s.github),

    // ── Fund: board, vault and maintainer balance change together ─────────────────
    s => s.github.unring(),
    s => s.web.fill("owner/repo", REPO),
    s => s.web.fill("Issue #", String(s.vars.issue)),
    s => s.web.fill("USDC", String(AMOUNT)),
    s => s.web.click("Post bounty"),
    s => s.web.seeSelector(newest("funding")),
    s => s.web.ring(`${newest("funding")} .qr`, "Solana Pay + Blink", "neutral"),
    async s => { s.vars.l0 = await ledger(s); },
    s => s.web.panel("On-chain balances — before funding", fmt(s.vars.l0 as any)),
    s => s.say("The maintainer posts fifty USDC on the issue. It's a Solana Pay transaction request, and also a Blink, so it can be funded from a wallet or straight from a post on X."),
    s => s.web.unring(),

    async s => {
      const payUrl = await s.web.attr(`${newest("funding")} [data-testid=pay-url]`, "href");
      sh(`RPC_URL=https://api.devnet.solana.com npx tsx scripts/pay.ts "${payUrl}"`); // the maintainer's wallet signs fund_bounty
      const bounties = await (await fetch("http://localhost:4545/api/bounties")).json();
      s.vars.bounty = bounties.at(-1).address;
    },
    s => s.web.seeSelector(newest("open"), 60_000),
    s => s.explorer.goto(devnet(`/address/${escrow.vaultAddress(new PublicKey(s.vars.bounty as string)).toBase58()}`)),
    s => s.explorer.see("Token Account", 30_000),
    async s => { s.vars.l1 = await ledger(s); },
    s => s.web.ring(`${newest("open")} [data-testid=escrow-account]`, "locked in the program", "good"),
    s => s.web.panel("On-chain balances — funded", fmt(s.vars.l1 as any)),
    async s => {
      const [a, b] = [s.vars.l0 as any, s.vars.l1 as any];
      if (b.maintainer !== a.maintainer - AMOUNT || b.vault !== AMOUNT || b.agent !== a.agent)
        throw new Error(`funding moved the wrong amounts: ${JSON.stringify({ before: a, after: b })}`);
    },
    s => s.say("The wallet signs fund bounty. Fifty USDC leaves the maintainer and is locked in a vault owned by the program, shown below in Explorer. Not even BountyBoard's server can move it anywhere but to the contributor, and the maintainer can't pull it back until it expires."),
    s => s.web.unring(),

    // ── Claim: a real coding agent does the work and opens the PR ─────────────────
    s => {
      const dir = mkdtempSync(join(tmpdir(), "bb-agent-"));
      sh(`gh repo clone ${REPO} . -- -q`, dir);
      const prompt = `You are an autonomous coding agent that earns USDC bounties on Solana. Fix GitHub issue #${s.vars.issue} in this repo (${REPO}): run \`gh issue view ${s.vars.issue}\` to read it, make the change on a new branch named agent-${s.vars.issue}, commit, push, and open a pull request with \`gh pr create\`. The PR body MUST contain these two lines exactly so you get paid:\n/claim #${s.vars.issue}\nwallet: ${agent.toBase58()}\nThen print only the PR URL.`;
      const tools = "Read,Write,Edit,Bash(gh issue view:*),Bash(git checkout:*),Bash(git add:*),Bash(git commit:*),Bash(git push:*),Bash(gh pr create:*),Bash(git status:*)";
      s.vars.agentRun = new Promise((ok, fail) =>
        exec(`claude -p ${JSON.stringify(prompt)} --allowedTools "${tools}" --max-turns 15`, { cwd: dir }, (e, out) =>
          e ? fail(e) : ok({ out, pr: /https:\/\/github\.com\/\S+\/pull\/\d+/.exec(out)?.[0] })));
    },
    s => s.say("Now an AI agent picks up the issue: Claude Code, running headless with its own Solana wallet. It reads the issue, writes the change, and opens a pull request. No account, no invoice."),
    async s => {
      const { out, pr } = (await s.vars.agentRun) as { out: string; pr?: string };
      if (!pr) throw new Error(`the agent did not open a PR; it said: ${out.slice(-400)}`);
      s.vars.pr = pr;
    },
    s => s.github.goto(new URL(s.vars.pr as string).pathname),
    s => s.github.ring(`/claim #${s.vars.issue}`, "claim + the agent's wallet", "neutral"),
    s => s.web.seeSelector(newest("open")),
    async s => { s.vars.l2 = await ledger(s); },
    s => s.web.panel("On-chain balances — PR opened, not merged", fmt(s.vars.l2 as any)),
    async s => {
      if (JSON.stringify(s.vars.l2) !== JSON.stringify(s.vars.l1)) throw new Error("money moved before the merge");
    },
    s => s.say("Two lines in the PR claim the bounty and name the agent's wallet. Until a human merges, nothing moves: the board still says open and every balance is unchanged.", s.github),
    s => s.github.unring(),

    // ── Merge: GitHub, board and chain all change from one click ──────────────────
    s => s.github.click("Squash and merge"),
    s => s.say("The maintainer reviews the agent's work and merges. That's the only approval there is. Watch all three screens.", s.github),
    s => s.github.click("Confirm squash and merge"),
    s => s.web.seeSelector(newest("paid"), 90_000),
    async s => {
      s.vars.l3 = await ledger(s);
      const payout = await s.web.attr(`${newest("paid")} [data-testid=payout-tx]`, "href");
      s.vars.payoutPath = new URL(payout as string).pathname;
    },
    s => s.web.panel("On-chain balances — merged", fmt(s.vars.l3 as any)),
    s => s.explorer.goto(devnet(s.vars.payoutPath as string)),
    s => s.github.see("Merged", 30_000),
    s => s.explorer.see("Success", 30_000),
    s => s.web.ring(`${newest("paid")} [data-testid=payout-tx]`, "paid on merge", "good"),
    async s => {
      const [a, b] = [s.vars.l1 as any, s.vars.l3 as any];
      if (b.agent !== a.agent + AMOUNT || b.vault !== null || b.maintainer !== a.maintainer)
        throw new Error(`release moved the wrong amounts: ${JSON.stringify({ before: a, after: b })}`);
    },
    s => s.say("One merge, three screens. GitHub shows it merged, the board shows paid, and below, the release transaction succeeded on devnet. The agent's wallet went from zero to fifty, the vault is closed, and the maintainer paid exactly fifty. Merge is payment."),
    s => s.web.unring(),

    // ── Nothing left behind: the vault is gone and the issue is closed ────────────
    s => s.explorer.goto(devnet(`/address/${escrow.vaultAddress(new PublicKey(s.vars.bounty as string)).toBase58()}`)),
    s => s.github.goto(new URL(s.vars.issueUrl as string).pathname),
    s => s.github.see("Closed", 30_000),
    s => s.say("And nothing is left behind: the issue closed itself, and the escrow vault no longer exists on-chain."),
  ],
});
