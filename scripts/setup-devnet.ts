// One-off: oracle + maintainer wallets, a 6-decimal test-USDC mint, 1000 tUSDC to the maintainer.
// ponytail: our own devnet mint stands in for USDC; swap MINT for real USDC on mainnet.
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { existsSync, writeFileSync } from 'node:fs';
import { DECIMALS, MINT_FILE, connection, keypair } from '../src/solana.ts';

const oracle = keypair('oracle');
const maintainer = keypair('maintainer');

for (const kp of [oracle, maintainer]) {
  if ((await connection.getBalance(kp.publicKey)) < 0.2 * LAMPORTS_PER_SOL) {
    const sig = await connection.requestAirdrop(kp.publicKey, 0.5 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
  }
  console.log(kp.publicKey.toBase58(), (await connection.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL, 'SOL');
}

if (!existsSync(MINT_FILE)) {
  const m = await createMint(connection, oracle, oracle.publicKey, null, DECIMALS);
  writeFileSync(MINT_FILE, m.toBase58());
  const ata = await getOrCreateAssociatedTokenAccount(connection, oracle, m, maintainer.publicKey);
  await mintTo(connection, oracle, m, ata.address, oracle, 1000n * 10n ** BigInt(DECIMALS));
  console.log('mint', m.toBase58(), '— 1000 tUSDC to maintainer');
}
