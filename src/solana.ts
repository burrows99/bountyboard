import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

export const DATA = new URL('../.data/', import.meta.url).pathname;
mkdirSync(DATA, { recursive: true });

export const connection = new Connection(process.env.RPC_URL ?? clusterApiUrl('devnet'), 'confirmed');
export const DECIMALS = 6;

export function keypair(name: string): Keypair {
  const file = `${DATA}${name}.json`;
  if (!existsSync(file)) writeFileSync(file, JSON.stringify([...Keypair.generate().secretKey]));
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(file, 'utf8'))));
}

// Each cluster has its own test-USDC mint and bounty store; keypairs are shared.
export const CLUSTER = process.env.RPC_URL?.includes('devnet') ? 'devnet' : process.env.RPC_URL ? 'local' : 'devnet';
export const MINT_FILE = `${DATA}mint-${CLUSTER}.txt`;

export function mint(): PublicKey {
  return new PublicKey(readFileSync(MINT_FILE, 'utf8').trim());
}

const rpc = process.env.RPC_URL;
export const explorer = (id: string, kind: 'tx' | 'address' = 'tx') =>
  `https://explorer.solana.com/${kind}/${id}?cluster=${rpc ? `custom&customUrl=${encodeURIComponent(rpc)}` : 'devnet'}`;
