// The on-chain escrow (program/programs/bounty_escrow) through the official Anchor client.
import anchor from '@anchor-lang/core';
import { PublicKey, Transaction, type Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { readFileSync } from 'node:fs';
import { DECIMALS, connection } from './solana.ts';

const IDL = JSON.parse(readFileSync(new URL('../program/target/idl/bounty_escrow.json', import.meta.url), 'utf8'));
const { BN } = anchor;

export class Escrow {
  readonly program: anchor.Program;
  readonly oracle: Keypair;
  readonly mint: PublicKey;
  readonly tokenProgram: PublicKey;

  // tokenProgram: classic SPL Token (USDC) or Token-2022 (e.g. PYUSD); the program accepts either.
  constructor(oracle: Keypair, mint: PublicKey, tokenProgram: PublicKey = TOKEN_PROGRAM_ID) {
    this.oracle = oracle;
    this.mint = mint;
    this.tokenProgram = tokenProgram;
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(oracle), { commitment: 'confirmed' });
    this.program = new anchor.Program(IDL, provider);
  }

  bountyAddress(maintainer: PublicKey, id: bigint) {
    const le = Buffer.alloc(8);
    le.writeBigUInt64LE(id);
    return PublicKey.findProgramAddressSync([Buffer.from('bounty'), maintainer.toBuffer(), le], this.program.programId)[0];
  }

  vaultAddress(bounty: PublicKey) {
    return getAssociatedTokenAddressSync(this.mint, bounty, true, this.tokenProgram);
  }

  /** The unsigned `fund_bounty` transaction a Solana Pay transaction request hands the maintainer's wallet. */
  async fundTransaction(maintainer: PublicKey, id: bigint, amount: number, expiresAt: number) {
    const ix = await this.program.methods
      .fundBounty(new BN(id.toString()), new BN(Math.round(amount * 10 ** DECIMALS)), new BN(expiresAt))
      .accounts({ maintainer, oracle: this.oracle.publicKey, mint: this.mint, tokenProgram: this.tokenProgram })
      .instruction();
    const tx = new Transaction({ feePayer: maintainer, ...(await connection.getLatestBlockhash()) }).add(ix);
    return tx.serialize({ requireAllSignatures: false }).toString('base64');
  }

  /** The bounty account if it has been funded on-chain, else null. */
  fetch(bounty: PublicKey) {
    return (this.program.account as any).bounty.fetchNullable(bounty);
  }

  /** Oracle-signed payout of the whole vault to the contributor's wallet. */
  release(maintainer: PublicKey, bounty: PublicKey, contributor: PublicKey): Promise<string> {
    return this.program.methods
      .release()
      .accountsPartial({
        oracle: this.oracle.publicKey, contributor, maintainer, mint: this.mint, bounty,
        vault: this.vaultAddress(bounty), tokenProgram: this.tokenProgram,
      })
      .rpc();
  }
}
