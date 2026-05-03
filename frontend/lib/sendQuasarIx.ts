"use client";

import {
  Connection,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { PROGRAM_ERRORS } from "./quasar-client";

/**
 * Wrap a Quasar TransactionInstruction in a Transaction, send via the
 * connected wallet, confirm to "finalized" by default. Returns the
 * signature.
 *
 * Pre-flight simulates the tx so a program error is surfaced to the
 * caller BEFORE Phantom shows its generic "Unexpected error" — we want
 * BelowDustThreshold / SlippageExceeded / etc. by name.
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

  // Pre-flight simulate. Cheap, gives us the actual program error before
  // we ask the user to sign.
  const sim = await connection.simulateTransaction(tx);
  if (sim.value.err) {
    throw new Error(translateProgramError(sim.value.err, sim.value.logs ?? []));
  }

  // Phantom's `sendTransaction` wraps the inner error and surfaces a
  // generic "Unexpected error". We catch + unwrap so the original cause
  // (RPC error, blockhash expiry, signing rejection, etc.) reaches the
  // caller's catch. The full object is also logged for inspection.
  let sig: string;
  try {
    sig = await wallet.sendTransaction(tx, connection);
  } catch (e) {
    console.error("[sendQuasarIx] wallet.sendTransaction failed:", e);
    const inner =
      e && typeof e === "object" && "error" in e
        ? (e as { error: unknown }).error
        : null;
    const innerMsg =
      inner instanceof Error
        ? inner.message
        : typeof inner === "string"
        ? inner
        : inner
        ? JSON.stringify(inner)
        : null;
    if (innerMsg) {
      throw new Error(`Wallet rejected: ${innerMsg}`);
    }
    throw e;
  }
  await connection.confirmTransaction(sig, opts.commitment ?? "finalized");
  return sig;
}

/**
 * Convert a Solana SimulatedTransactionResponse error into a human string.
 * Looks for `{ InstructionError: [ix_index, { Custom: code }] }` and maps
 * the code via PROGRAM_ERRORS (auto-emitted by the Quasar TS client).
 */
function translateProgramError(err: unknown, logs: string[]): string {
  // Custom-program-error case: { InstructionError: [N, { Custom: code }] }
  if (err && typeof err === "object" && "InstructionError" in err) {
    const ie = (err as { InstructionError: [number, unknown] })
      .InstructionError;
    if (Array.isArray(ie) && ie.length === 2) {
      const inner = ie[1];
      if (
        inner &&
        typeof inner === "object" &&
        "Custom" in inner &&
        typeof (inner as { Custom: number }).Custom === "number"
      ) {
        const code = (inner as { Custom: number }).Custom;
        const known = PROGRAM_ERRORS[code];
        if (known) {
          // Try to also find a "Program log: " line for context.
          const logLine = logs.find(
            (l) => l.includes("Error") || l.includes("Program log:")
          );
          return `${known.name}${known.msg ? `: ${known.msg}` : ""}${
            logLine ? ` (${logLine.trim()})` : ""
          }`;
        }
        return (
          `Custom error ${code}` +
          (logs.length ? ` — ${logs.slice(-3).join(" | ")}` : "")
        );
      }
    }
  }
  // Other shapes — surface raw err + tail of logs.
  const errStr = JSON.stringify(err);
  const tail = logs.slice(-3).join(" | ");
  return tail ? `${errStr} — ${tail}` : errStr;
}
