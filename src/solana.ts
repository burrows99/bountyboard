import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const DATA = new URL('../.data/', import.meta.url).pathname;
mkdirSync(DATA, { recursive: true });

export const connection = new Connection(process.env.RPC_URL ?? clusterApiUrl('devnet'), 'confirmed');
export const DECIMALS = 6;

// On a host, a keypair comes from KEYPAIR_<NAME> (its JSON secret-key array); locally, from .data/.
export function keypair(name: string): Keypair {
  const env = process.env[`KEYPAIR_${name.toUpperCase()}`];
  if (env) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env)));
  const file = `${DATA}${name}.json`;
  if (!existsSync(file)) writeFileSync(file, JSON.stringify([...Keypair.generate().secretKey]));
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, 'utf8'))));
}

// Each cluster has its own test-USDC mint and bounty store; keypairs are shared.
export const CLUSTER = process.env.RPC_URL?.includes('devnet') ? 'devnet' : process.env.RPC_URL ? 'local' : 'devnet';
export const MINT_FILE = `${DATA}mint-${CLUSTER}.txt`;

export function mint(): PublicKey {
  return new PublicKey(process.env.MINT ?? readFileSync(MINT_FILE, 'utf8').trim());
}

const rpc = process.env.RPC_URL;
export const explorer = (id: string, kind: 'tx' | 'address' = 'tx') =>
  `https://explorer.solana.com/${kind}/${id}?cluster=${CLUSTER === 'devnet' ? 'devnet' : `custom&customUrl=${encodeURIComponent(rpc!)}`}`;
