// BountyBoard: USDC escrowed on-chain per GitHub issue, released to the contributor when the claiming PR merges.
import { createServer, type IncomingMessage } from 'node:http';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { encodeURL } from '@solana/pay';
import { createActionHeaders } from '@solana/actions';
import { CLUSTER, DATA, connection, explorer, keypair, mint } from './solana.ts';
import { Escrow } from './escrow.ts';

type Bounty = {
  id: string; chainId: string; repo: string; issue: number; amount: number; expiresAt: number; createdAt: string;
  status: 'funding' | 'open' | 'paying' | 'paid';
  maintainer?: string; address?: string; fundSig?: string; payoutSig?: string;
  pr?: string; contributor?: string; wallet?: string;
};

const STORE = `${DATA}bounties-${CLUSTER}.json`;
const PORT = Number(process.env.PORT ?? 4545);
const PUBLIC_URL = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? execSync('gh auth token').toString().trim();
const BOUNTY_DAYS = Number(process.env.BOUNTY_DAYS ?? 30);
const escrow = new Escrow(keypair('oracle'), mint());
// Solana Actions (Blinks) and Solana Pay transaction requests share one endpoint: same POST shape.
const ACTION_HEADERS = createActionHeaders({ chainId: CLUSTER === 'devnet' ? 'devnet' : 'mainnet', actionVersion: '2.4' });
const actionUrl = (b: Bounty) => `${PUBLIC_URL}/api/pay/${b.id}`;

const load = (): Bounty[] => (existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf8')) : []);
const save = (b: Bounty[]) => writeFileSync(STORE, JSON.stringify(b, null, 2));

async function github(path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { authorization: `Bearer ${GITHUB_TOKEN}`, accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status} ${path}`);
  return res.json();
}

// A PR merged after the bounty was posted, whose body says `/claim #N` and `wallet: <pubkey>`, claims bounty N.
async function findMergedClaim(b: Bounty) {
  const prs = await github(`/repos/${b.repo}/pulls?state=closed&sort=updated&direction=desc&per_page=50`);
  for (const pr of prs) {
    if (!pr.merged_at || pr.merged_at < b.createdAt || !new RegExp(`/claim #${b.issue}\\b`).test(pr.body ?? '')) continue;
    const wallet = /wallet:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/.exec(pr.body)?.[1];
    if (wallet) return { pr: pr.html_url as string, contributor: pr.user.login as string, wallet };
  }
}

async function sync(b: Bounty) {
  if (!b.maintainer || !b.address) return; // no wallet has asked for the funding transaction yet
  const address = new PublicKey(b.address);
  if (b.status === 'funding') {
    if (!(await escrow.fetch(address))) return;
    const [first] = await connection.getSignaturesForAddress(address, { limit: 1 });
    Object.assign(b, { status: 'open', fundSig: first?.signature });
  } else if (b.status === 'open') {
    const claim = await findMergedClaim(b);
    if (!claim) return;
    // ponytail: 'paying' + one sync loop is the double-pay guard; the program closes the vault on release, so a retry can't pay twice.
    Object.assign(b, { status: 'paying', ...claim });
    save(bounties);
    const sig = await escrow.release(new PublicKey(b.maintainer), address, new PublicKey(claim.wallet));
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
  payUrl: b.status === 'funding' ? encodeURL({ link: new URL(actionUrl(b)) }).toString() : undefined,
  blinkUrl: b.status === 'funding' ? `https://dial.to/?action=solana-action:${encodeURIComponent(actionUrl(b))}&cluster=${CLUSTER}` : undefined,
  fundTx: b.fundSig && explorer(b.fundSig),
  payoutTx: b.payoutSig && explorer(b.payoutSig),
  escrowAccount: b.address && explorer(b.address, 'address'),
});

const body = (req: IncomingMessage) =>
  new Promise<any>((ok) => { let s = ''; req.on('data', (c) => (s += c)).on('end', () => ok(JSON.parse(s || '{}'))); });

createServer(async (req, res) => {
  const json = (code: number, data: unknown) => res.writeHead(code, ACTION_HEADERS).end(JSON.stringify(data));
  const url = new URL(req.url ?? '/', PUBLIC_URL);
  try {
    if (req.method === 'OPTIONS') return json(204, null);
    if (req.method === 'GET' && url.pathname === '/api/bounties') return json(200, bounties.map(view));
    if (req.method === 'GET' && url.pathname === '/actions.json')
      return json(200, { rules: [{ pathPattern: '/fund/*', apiPath: '/api/pay/*' }, { pathPattern: '/api/pay/**', apiPath: '/api/pay/**' }] });
    if (req.method === 'POST' && url.pathname === '/api/bounties') {
      const { repo, issue, amount } = await body(req);
      if (!/^[\w.-]+\/[\w.-]+$/.test(repo) || !(Number(issue) > 0) || !(Number(amount) > 0)) return json(400, { error: 'repo, issue, amount required' });
      await github(`/repos/${repo}/issues/${issue}`); // 404s on a bogus issue
      const b: Bounty = {
        id: crypto.randomUUID(), chainId: randomBytes(8).readBigUInt64LE().toString(), repo, issue: Number(issue),
        amount: Number(amount), expiresAt: Math.floor(Date.now() / 1000) + BOUNTY_DAYS * 86400, createdAt: new Date().toISOString(), status: 'funding',
      };
      bounties.push(b);
      save(bounties);
      return json(201, view(b));
    }
    // Solana Pay transaction request: the wallet GETs a label, then POSTs its account and signs what we return.
    const pay = /^\/api\/pay\/([\w-]+)$/.exec(url.pathname);
    if (pay) {
      const b = bounties.find((x) => x.id === pay[1] && x.status === 'funding');
      if (!b) return json(404, { error: 'no bounty awaiting funding' });
      if (req.method === 'GET')
        return json(200, {
          type: 'action', icon: `${PUBLIC_URL}/logo.png`, label: `Fund ${b.amount} USDC`,
          title: `Bounty: ${b.repo}#${b.issue}`,
          description: `Escrow ${b.amount} USDC on-chain. Whoever's PR closes ${b.repo}#${b.issue} is paid the moment it merges - human or AI agent. Refundable after ${new Date(b.expiresAt * 1000).toDateString()}.`,
        });
      const maintainer = new PublicKey((await body(req)).account);
      Object.assign(b, { maintainer: maintainer.toBase58(), address: escrow.bountyAddress(maintainer, BigInt(b.chainId)).toBase58() });
      save(bounties);
      const transaction = await escrow.fundTransaction(maintainer, BigInt(b.chainId), b.amount, b.expiresAt);
      return json(200, { type: 'transaction', transaction, message: `Escrow ${b.amount} USDC for ${b.repo}#${b.issue}` });
    }
    if (req.method === 'GET' && url.pathname === '/logo.png')
      return res.writeHead(200, { 'content-type': 'image/png' }).end(readFileSync(new URL('../assets/logo.png', import.meta.url)));
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html' || url.pathname.startsWith('/fund/')))
      return res.writeHead(200, { 'content-type': 'text/html' }).end(readFileSync(new URL('../public/index.html', import.meta.url)));
    json(404, { error: 'not found' });
  } catch (e: any) {
    json(500, { error: e.message });
  }
}).listen(PORT, () => console.log(`BountyBoard on ${PUBLIC_URL} · program ${escrow.program.programId.toBase58()} · oracle ${escrow.oracle.publicKey.toBase58()}`));
