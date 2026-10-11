// BountyBoard: USDC escrowed per GitHub issue, released on-chain when the claiming PR merges.
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Keypair, PublicKey } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount, transfer } from '@solana/spl-token';
import { encodeURL, findReference, validateTransfer, FindReferenceError } from '@solana/pay';
import BigNumber from 'bignumber.js';
import { DATA, DECIMALS, connection, explorer, keypair, mint } from './solana.ts';

type Bounty = {
  id: string; repo: string; issue: number; amount: number; reference: string;
  status: 'funding' | 'open' | 'paying' | 'paid';
  fundSig?: string; payoutSig?: string; pr?: string; contributor?: string; wallet?: string;
};

const STORE = `${DATA}bounties.json`;
const PORT = Number(process.env.PORT ?? 4545);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? execSync('gh auth token').toString().trim();
const escrow = keypair('escrow');
const MINT = mint();

const load = (): Bounty[] => (existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : []);
const save = (b: Bounty[]) => writeFileSync(STORE, JSON.stringify(b, null, 2));

const payUrl = (b: Bounty) =>
  encodeURL({
    recipient: escrow.publicKey,
    amount: new BigNumber(b.amount),
    splToken: MINT,
    reference: new PublicKey(b.reference),
    label: 'BountyBoard',
    message: `Bounty for ${b.repo}#${b.issue}`,
  }).toString();

async function github(path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} ${path}`);
  return res.json();
}

// A merged PR whose body says `/claim #N` and `wallet: <pubkey>` claims bounty N.
async function findMergedClaim(b: Bounty) {
  const prs = await github(`/repos/${b.repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`);
  for (const pr of prs) {
    if (!pr.merged_at || !new RegExp(`/claim #${b.issue}\\b`).test(pr.body ?? '')) continue;
    const wallet = /wallet:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(pr.body)?.[1];
    if (wallet) return { pr: pr.html_url as string, contributor: pr.user.login as string, wallet };
  }
}

async function sync(b: Bounty) {
  if (b.status === 'funding') {
    try {
      const { signature } = await findReference(connection, new PublicKey(b.reference), { finality: 'confirmed' });
      await validateTransfer(connection, signature, {
        recipient: escrow.publicKey, amount: new BigNumber(b.amount), splToken: MINT, reference: new PublicKey(b.reference),
      }, { commitment: 'confirmed' });
      Object.assign(b, { status: 'open', fundSig: signature });
    } catch (e) {
      if (!(e instanceof FindReferenceError)) throw e;
    }
  } else if (b.status === 'open') {
    const claim = await findMergedClaim(b);
    if (!claim) return;
    // ponytail: 'paying' + one sync loop is the double-pay guard; needs a DB lock if this ever runs multi-process.
    Object.assign(b, { status: 'paying', ...claim });
    save(bounties);
    const from = await getOrCreateAssociatedTokenAccount(connection, escrow, MINT, escrow.publicKey);
    const to = await getOrCreateAssociatedTokenAccount(connection, escrow, MINT, new PublicKey(claim.wallet));
    const sig = await transfer(connection, escrow, from.address, to.address, escrow, BigInt(Math.round(b.amount * 10 ** DECIMALS)));
    Object.assign(b, { status: 'paid', payoutSig: sig });
  }
}

let bounties = load();
let syncing = false;
setInterval(async () => {
  if (syncing) return;
  syncing = true;
  for (const b of bounties) await sync(b).catch((e) => console.error(b.id, e.message));
  save(bounties);
  syncing = false;
}, 3000);

const view = (b: Bounty) => ({
  ...b,
  payUrl: b.status === 'funding' ? payUrl(b) : undefined,
  fundTx: b.fundSig && explorer(b.fundSig),
  payoutTx: b.payoutSig && explorer(b.payoutSig),
});

const body = (req: import('node:http').IncomingMessage) =>
  new Promise<any>((ok) => { let s = ''; req.on('data', (c) => (s += c)).on('end', () => ok(JSON.parse(s || '{}'))); });

createServer(async (req, res) => {
  const json = (code: number, data: unknown) => res.writeHead(code, { 'content-type': 'application/json' }).end(JSON.stringify(data));
  try {
    if (req.method === 'GET' && req.url === '/api/bounties') return json(200, bounties.map(view));
    if (req.method === 'POST' && req.url === '/api/bounties') {
      const { repo, issue, amount } = await body(req);
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !(Number(issue) > 0) || !(Number(amount) > 0)) return json(400, { error: 'repo, issue, amount required' });
      await github(`/repos/${repo}/issues/${issue}`); // 404s on a bogus issue
      const b: Bounty = { id: crypto.randomUUID(), repo, issue: Number(issue), amount: Number(amount), reference: Keypair.generate().publicKey.toBase58(), status: 'funding' };
      bounties.push(b);
      save(bounties);
      return json(201, view(b));
    }
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html'))
      return res.writeHead(200, { 'content-type': 'text/html' }).end(readFileSync(new URL('../public/index.html', import.meta.url)));
    json(404, { error: 'not found' });
  } catch (e: any) {
    json(500, { error: e.message });
  }
}).listen(PORT, () => console.log(`BountyBoard on http://localhost:${PORT} · escrow ${escrow.publicKey.toBase58()}`));
