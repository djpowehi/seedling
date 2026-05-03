"use client";

import {
  Connection,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

/**
 * Wrap a Quasar TransactionInstruction in a Transaction, send via the
 * connected wallet, confirm to "finalized" by default. Returns the
 * signature.
 *
 * Mirrors the ergonomics of Anchor's `program.methods.foo(...).rpc()`
 * shape so call-site migration is mostly a one-line swap.
 */
export async function sendQuasarIx(
  ixs: TransactionInstruction | TransactionInstruction[],
  connection: Connection,
  wallet: Pick<WalletContextState, "publicKey" | "sendTransaction">,
  opts: { commitment?: "confirmed" | "finalized" } = {}
): Promise<string> {
  if (!wallet.publicKey || !wallet.sendTransaction) {
    throw new Error("Wallet not connected");
  }

  const tx = new Transaction();
  if (Array.isArray(ixs)) {
    ixs.forEach((ix) => tx.add(ix));
  } else {
    tx.add(ixs);
  }
  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  const sig = await wallet.sendTransaction(tx, connection);
  await connection.confirmTransaction(sig, opts.commitment ?? "finalized");
  return sig;
}
