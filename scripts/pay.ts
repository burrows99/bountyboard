// Stands in for the maintainer's wallet: pays a Solana Pay transfer-request URL from the maintainer keypair.
import { createTransfer, parseURL, type TransferRequestURL } from '@solana/pay';
import { sendAndConfirmTransaction } from '@solana/web3.js';
import { connection, explorer, keypair } from '../src/solana.ts';

const maintainer = keypair('maintainer');
const { recipient, amount, splToken, reference, memo } = parseURL(process.argv[2]) as TransferRequestURL;
const tx = await createTransfer(connection, maintainer.publicKey, { recipient, amount: amount!, splToken, reference, memo });
const sig = await sendAndConfirmTransaction(connection, tx, [maintainer]);
console.log(explorer(sig));
