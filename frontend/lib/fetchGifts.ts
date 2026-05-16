// Wallet-free gift-history fetcher for the public kid view.
//
// Strategy: walk recent signatures touching the FamilyPosition PDA, fetch
// each transaction, scan the program-log lines for `Deposited` events,
// decode with Anchor's event coder. Every deposit shows on the wall —
// including the parent's own (birthdays, top-ups, surprise additions).
//
// Why not getProgramAccounts + filter: events are emitted in tx logs, not
// stored in account state — there's no on-chain log of "every depositor
// who ever gifted." We have to walk transactions.
//
// Cap at the most recent 20 signatures. Public RPCs rate-limit aggressively
// (429s after ~10 batched gets) and most families have at most a handful of
// transactions to walk; 20 is plenty for the wall (which renders 8 max) and
// stays below the throttle.

import { Connection, PublicKey } from "@solana/web3.js";
import { DEPOSITED_DISCRIMINATOR, DepositedCodec } from "@/lib/quasar-client";

export type GiftEntry = {
  depositor: string; // base58
  amountUsd: number;
  ts: number; // unix seconds
  sig: string;
  // Self-chosen name from the gifter's `?from=` memo. Undefined when the
  // gift came from a wallet that didn't supply one.
  fromName?: string;
};

// Quasar event log format: `Program data: <base64>` where the bytes are
// [1-byte event discriminator, ...struct payload]. We decode by matching
// the discriminator then handing the rest to the codec.
const PROGRAM_LOG_PREFIX = "Program data: ";

// Module-level cache: familyPda → Map<sig, GiftEntry>.
// Survives across re-renders + polls within the same page session.
const giftCache = new Map<string, Map<string, GiftEntry>>();

export async function fetchGifts(
  connection: Connection,
  familyPda: PublicKey,
  parent: PublicKey,
  limit = 20
): Promise<GiftEntry[]> {
  // Module-level cache (declared below). Subsequent polls only fetch
  // signatures we haven't decoded yet — most polls do zero RPC.
  const cacheKey = familyPda.toBase58();
  const cached = giftCache.get(cacheKey) ?? new Map<string, GiftEntry>();

  const sigs = await connection.getSignaturesForAddress(familyPda, { limit });
  if (sigs.length === 0) {
    return [...cached.values()].sort((a, b) => b.ts - a.ts);
  }

  const missing = sigs.filter((s) => !cached.has(s.signature));
  if (missing.length === 0) {
    return [...cached.values()].sort((a, b) => b.ts - a.ts);
  }

  // Parallel via Promise.all — N independent HTTP requests fired at once.
  // On Helius (~50-100ms each) this collapses to ~100ms total instead of
  // N * 100ms serial. Public RPCs are slower but still 5-10x faster
  // parallel than serial.
  const txs = await Promise.all(
    missing.map((s) =>
      connection.getTransaction(s.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      })
    )
  );

  txs.forEach((tx, i) => {
    if (!tx?.meta?.logMessages) return;
    if (tx.meta.err) return;
    const sig = missing[i].signature;
    // Only entries that flowed through `send a gift` carry the
    // `seedling-gift:` memo. Skip plain dashboard deposits — those are
    // top-ups, not gifts, and shouldn't pollute the wall.
    const memoMatch = extractGiftMemo(tx.meta.logMessages);
    if (memoMatch === null) return;
    const fromName = memoMatch.length > 0 ? memoMatch : undefined;

    for (const line of tx.meta.logMessages) {
      if (!line.startsWith(PROGRAM_LOG_PREFIX)) continue;
      const b64 = line.slice(PROGRAM_LOG_PREFIX.length);
      try {
        const bytes = Buffer.from(b64, "base64");
        // Match Quasar's 1-byte event discriminator for Deposited.
        if (bytes[0] !== DEPOSITED_DISCRIMINATOR[0]) continue;
        const data = DepositedCodec.decode(bytes.subarray(1));
        cached.set(sig, {
          depositor: data.depositor.toBase58(),
          amountUsd: Number(data.amount) / 1_000_000,
          ts: Number(data.ts),
          sig,
          fromName,
        });
      } catch {
        // Not our event or decode failure — ignore this log line.
      }
    }
  });
  giftCache.set(cacheKey, cached);
  const out = [...cached.values()];

  out.sort((a, b) => b.ts - a.ts);
  return out;
}

// SPL Memo logs as: `Program log: Memo (len 22): "seedling-gift:Grandma"`
// We match on the prefix and pull out the trailing name. Returns:
//   null   → no `seedling-gift:` memo found (NOT a gift — caller skips)
//   ""     → memo present, name omitted (anonymous gift)
//   "Foo"  → memo present, named gifter
const MEMO_LOG_RE = /Program log: Memo \(len \d+\): "seedling-gift:([^"]*)"/;

function extractGiftMemo(logs: string[]): string | null {
  for (const line of logs) {
    const m = MEMO_LOG_RE.exec(line);
    if (m) return m[1].trim();
  }
  return null;
}
