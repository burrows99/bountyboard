// The program's guarantees, against a live cluster (local validator or devnet):
//   only the oracle can release · the maintainer can't refund before expiry ·
//   release pays the contributor in full and closes the bounty · refund works after expiry.
// Run: RPC_URL=http://127.0.0.1:8899 npm test
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import anchor from '@anchor-lang/core';
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, createMint, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from '@solana/spl-token';
import { connection, keypair, mint } from '../src/solana.ts';
import { Escrow } from '../src/escrow.ts';

const MINT = mint();
const escrow = new Escrow(keypair('oracle'), MINT);
const maintainer = keypair('maintainer');
const { BN } = anchor;

const balance = (owner: PublicKey) =>
  connection.getTokenAccountBalance(getAssociatedTokenAddressSync(MINT, owner)).then((b) => b.value.uiAmount ?? 0, () => 0);

async function fund(amount: number, expiresInSec: number) {
  const id = randomBytes(8).readBigUInt64LE();
  const tx = Transaction.from(Buffer.from(
    await escrow.fundTransaction(maintainer.publicKey, id, amount, Math.floor(Date.now() / 1000) + expiresInSec), 'base64'));
  tx.partialSign(maintainer);
  await connection.confirmTransaction(await connection.sendRawTransaction(tx.serialize()), 'confirmed');
  return escrow.bountyAddress(maintainer.publicKey, id);
}

const refund = (bounty: PublicKey) =>
  escrow.program.methods.refund()
    .accountsPartial({ maintainer: maintainer.publicKey, mint: MINT, bounty, vault: escrow.vaultAddress(bounty), tokenProgram: TOKEN_PROGRAM_ID })
    .signers([maintainer]).rpc();

const contributor = Keypair.generate().publicKey;

// 1. Only the oracle can release.
const b1 = await fund(10, 3600);
const impostor = new Escrow(Keypair.generate(), MINT);
// fee money for the impostor, so the rejection below comes from the program, not an empty wallet
await sendAndConfirmTransaction(connection, new Transaction().add(SystemProgram.transfer({ fromPubkey: maintainer.publicKey, toPubkey: impostor.oracle.publicKey, lamports: 5_000_000 })), [maintainer]);
await assert.rejects(impostor.release(maintainer.publicKey, b1, impostor.oracle.publicKey), /ConstraintHasOne/);
console.log('✓ a key that is not the oracle cannot release');

// 2. The maintainer cannot pull the money back while the bounty is live.
await assert.rejects(refund(b1), /NotExpired/);
console.log('✓ maintainer cannot refund before expiry');

// 3. The oracle's release pays the contributor everything and closes the bounty.
await escrow.release(maintainer.publicKey, b1, contributor);
assert.equal(await balance(contributor), 10);
assert.equal(await escrow.fetch(b1), null);
console.log('✓ release pays the contributor 10 and closes the bounty');

// 4. After expiry, the maintainer gets a refund.
const before = await balance(maintainer.publicKey);
const b2 = await fund(5, 2);
await new Promise((r) => setTimeout(r, 4000));
await refund(b2);
assert.equal(await balance(maintainer.publicKey), before);
console.log('✓ maintainer is refunded after expiry');

// 5. Any stablecoin: a Token-2022 mint (the program PYUSD-style tokens use) escrows and pays out the same way.
{
  const oracle = keypair('oracle');
  const m22 = await createMint(connection, maintainer, maintainer.publicKey, null, 6, undefined, undefined, TOKEN_2022_PROGRAM_ID);
  const src = await getOrCreateAssociatedTokenAccount(connection, maintainer, m22, maintainer.publicKey, false, undefined, undefined, TOKEN_2022_PROGRAM_ID);
  await mintTo(connection, maintainer, m22, src.address, maintainer, 7_000_000, [], undefined, TOKEN_2022_PROGRAM_ID);
  const e22 = new Escrow(oracle, m22, TOKEN_2022_PROGRAM_ID);
  const id = randomBytes(8).readBigUInt64LE();
  const tx = Transaction.from(Buffer.from(await e22.fundTransaction(maintainer.publicKey, id, 7, Math.floor(Date.now() / 1000) + 3600), 'base64'));
  tx.partialSign(maintainer);
  await connection.confirmTransaction(await connection.sendRawTransaction(tx.serialize()), 'confirmed');
  const agent = Keypair.generate().publicKey;
  await e22.release(maintainer.publicKey, e22.bountyAddress(maintainer.publicKey, id), agent);
  const got = await connection.getTokenAccountBalance(getAssociatedTokenAddressSync(m22, agent, false, TOKEN_2022_PROGRAM_ID));
  assert.equal(got.value.uiAmount, 7);
  console.log('✓ a Token-2022 stablecoin escrows and pays out 7');
}
