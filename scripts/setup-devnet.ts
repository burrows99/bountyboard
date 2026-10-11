// One-off: escrow + maintainer wallets, a 6-decimal test-USDC mint, 1000 tUSDC to the maintainer.
// ponytail: our own devnet mint stands in for USDC; swap MINT for real USDC on mainnet.
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { existsSync, writeFileSync } from 'node:fs';
import { DATA, DECIMALS, connection, keypair } from '../src/solana.ts';

const escrow = keypair('escrow');
const maintainer = keypair('maintainer');

for (const kp of [escrow, maintainer]) {
  if ((await connection.getBalance(kp.publicKey)) < 0.2 * LAMPORTS_PER_SOL) {
    const sig = await connection.requestAirdrop(kp.publicKey, 0.5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }
  console.log(kp.publicKey.toBase58(), (await connection.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL, 'SOL');
}

if (!existsSync(`${DATA}mint.txt`)) {
  const m = await createMint(connection, escrow, escrow.publicKey, null, DECIMALS);
  writeFileSync(`${DATA}mint.txt`, m.toBase58());
  const ata = await getOrCreateAssociatedTokenAccount(connection, escrow, m, maintainer.publicKey);
  await mintTo(connection, escrow, m, ata.address, escrow, 1000n * 10n ** BigInt(DECIMALS));
  await getOrCreateAssociatedTokenAccount(connection, escrow, m, escrow.publicKey);
  console.log('mint', m.toBase58(), '— 1000 tUSDC to maintainer');
}
