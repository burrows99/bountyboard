// Plays the maintainer's wallet in a Solana Pay transaction request: POST our account to the
// link in the `solana:` URL, sign the fund_bounty transaction it returns, send it.
import { Transaction } from '@solana/web3.js';
import { connection, explorer, keypair } from '../src/solana.ts';

const maintainer = keypair('maintainer');
const link = decodeURIComponent(process.argv[2].replace(/^solana:/, ''));
const res = await fetch(link, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ account: maintainer.publicKey.toBase58() }) });
if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
const tx = Transaction.from(Buffer.from((await res.json()).transaction, 'base64'));
tx.partialSign(maintainer);
const sig = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction(sig, 'confirmed');
console.log(explorer(sig));
