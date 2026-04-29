// Wallet-free gift-history fetcher for the public kid view.
//
// Strategy: walk recent signatures touching the FamilyPosition PDA, fetch
// each transaction, scan the program-log lines for `Deposited` events,
// decode with Anchor's event coder, then keep only those where
// `depositor != family.parent`. That's the "gift" set.
//
// Why not getProgramAccounts + filter: events are emitted in tx logs, not
// stored in account state — there's no on-chain log of "every depositor
// who ever gifted." We have to walk transactions.
//
// Cap at the most recent 20 signatures. Public devnet RPC rate-limits
// aggressively (429s after ~10 batched gets) and our demo family has at
// most a handful of transactions to walk; 20 is plenty for the wall (which
// renders 8 max) and stays below the throttle.

import { AnchorProvider, BorshCoder, Idl, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  type Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";

import idl from "@/lib/idl.json";
import type { Seedling } from "@/lib/types";

export type GiftEntry = {
  depositor: string; // base58
  amountUsd: number;
  ts: number; // unix seconds
  sig: string;
  // Self-chosen name from the gifter's `?from=` memo. Undefined when the
  // gift came from a wallet that didn't supply one.
  fromName?: string;
};

const stubKeypair = Keypair.generate();
const stubWallet = {
  publicKey: stubKeypair.publicKey,
  signTransaction: <T extends Transaction | VersionedTransaction>(
    _tx: T
  ): Promise<T> => {
    throw new Error("read-only wallet — signing is not supported");
  },
  signAllTransactions: <T extends Transaction | VersionedTransaction>(
    _txs: T[]
  ): Promise<T[]> => {
    throw new Error("read-only wallet — signing is not supported");
  },
};

let cachedProgram: Program<Seedling> | null = null;
let cachedConnection: Connection | null = null;
function getProgram(connection: Connection): Program<Seedling> {
  if (cachedProgram && cachedConnection === connection) return cachedProgram;
  const provider = new AnchorProvider(connection, stubWallet, {
    commitment: "confirmed",
  });
  cachedProgram = new Program(
    idl as Idl,
    provider
  ) as unknown as Program<Seedling>;
  cachedConnection = connection;
  return cachedProgram;
}

const PROGRAM_LOG_PREFIX = "Program data: ";

type DepositedEvent = {
  family: PublicKey;
  depositor: PublicKey;
  amount: { toString(): string };
  sharesMinted: { toString(): string };
  feeToTreasury: { toString(): string };
  ts: { toString(): string };
};

// Module-level cache keyed by familyPda. We store every gift we've ever
// decoded for this family. On subsequent polls we only fetch the
// transactions whose signatures we haven't seen yet — a tight diff that
// makes the 30s poll cycle effectively instant.
type CacheEntry = {
  byPubkey: Map<string, GiftEntry>; // sig → entry (dedup-friendly)
};
const giftCache = new Map<string, CacheEntry>();

export async function fetchGifts(
  connection: Connection,
  familyPda: PublicKey,
  parent: PublicKey,
  limit = 20
): Promise<GiftEntry[]> {
  const cacheKey = familyPda.toBase58();
  const cached = giftCache.get(cacheKey) ?? { byPubkey: new Map() };

  const sigs = await connection.getSignaturesForAddress(familyPda, { limit });
  if (sigs.length === 0) {
    return Array.from(cached.byPubkey.values()).sort((a, b) => b.ts - a.ts);
  }

  // Diff: only fetch txs we don't already have decoded. On a quiet family
  // this is empty most of the time → we skip getTransactions entirely.
  const missingSigs = sigs.filter((s) => !cached.byPubkey.has(s.signature));
  if (missingSigs.length === 0) {
    return Array.from(cached.byPubkey.values()).sort((a, b) => b.ts - a.ts);
  }

  const program = getProgram(connection);
  const eventCoder = new BorshCoder(program.idl as Idl).events;

  // Batched fetch: web3.js 1.x's getTransactions packs all sigs into a
  // single JSON-RPC batch request (one HTTP roundtrip, server processes
  // them in parallel). Cuts cold-fetch from 10-20s of serial calls down
  // to ~1-2s.
  const txs = await connection.getTransactions(
    missingSigs.map((s) => s.signature),
    { maxSupportedTransactionVersion: 0, commitment: "confirmed" }
  );

  txs.forEach((tx, i) => {
    if (!tx?.meta?.logMessages) return;
    if (tx.meta.err) return;
    const sig = missingSigs[i].signature;
    const fromName = extractGiftMemo(tx.meta.logMessages);

    for (const line of tx.meta.logMessages) {
      if (!line.startsWith(PROGRAM_LOG_PREFIX)) continue;
      const b64 = line.slice(PROGRAM_LOG_PREFIX.length);
      try {
        const ev = eventCoder.decode(b64);
        if (!ev || ev.name !== "deposited") continue;
        const data = ev.data as DepositedEvent;
        if (data.depositor.equals(parent)) continue;
        cached.byPubkey.set(sig, {
          depositor: data.depositor.toBase58(),
          amountUsd: Number(data.amount.toString()) / 1_000_000,
          ts: Number(data.ts.toString()),
          sig,
          fromName,
        });
      } catch {
        // Not our event or decode failure — ignore this log line.
      }
    }
  });

  giftCache.set(cacheKey, cached);
  return Array.from(cached.byPubkey.values()).sort((a, b) => b.ts - a.ts);
}

// SPL Memo logs as: `Program log: Memo (len 22): "seedling-gift:Grandma"`
// We match on the prefix and pull out the trailing name.
const MEMO_LOG_RE = /Program log: Memo \(len \d+\): "seedling-gift:([^"]*)"/;

function extractGiftMemo(logs: string[]): string | undefined {
  for (const line of logs) {
    const m = MEMO_LOG_RE.exec(line);
    if (m) {
      const name = m[1].trim();
      return name.length > 0 ? name : undefined;
    }
  }
  return undefined;
}
