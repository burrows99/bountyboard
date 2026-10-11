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

export function mint(): PublicKey {
  return new PublicKey(readFileSync(`${DATA}mint.txt`, 'utf8').trim());
}

const rpc = process.env.RPC_URL;
export const explorer = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=${rpc ? `custom&customUrl=${encodeURIComponent(rpc)}` : 'devnet'}`;
