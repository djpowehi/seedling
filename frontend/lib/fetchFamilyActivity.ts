// Family activity feed — fetches every meaningful on-chain event that
// touched a FamilyPosition PDA: creation, deposits (including gifts),
// withdrawals, monthly distributions, year-end bonuses, closures.
//
// Strategy mirrors fetchGifts.ts: walk recent signatures touching the
// family PDA, fetch each tx, scan program-log lines for Quasar event
// emissions, decode with the appropriate codec.
//
// Gift detection: a deposit is classified as a gift when the tx carries
// the SPL Memo prefix `seedling-gift:`. Otherwise it's a regular deposit
// (parent top-up or direct USDC transfer to the family). The depositor's
// wallet is captured in either case for the row label.

import { Connection, PublicKey } from "@solana/web3.js";
import {
  DEPOSITED_DISCRIMINATOR,
  DepositedCodec,
  WITHDRAWN_DISCRIMINATOR,
  WithdrawnCodec,
  MONTHLY_ALLOWANCE_DISTRIBUTED_DISCRIMINATOR,
  MonthlyAllowanceDistributedCodec,
  BONUS_DISTRIBUTED_DISCRIMINATOR,
  BonusDistributedCodec,
  FAMILY_CREATED_DISCRIMINATOR,
  FamilyCreatedCodec,
  FAMILY_CLOSED_DISCRIMINATOR,
  FamilyClosedCodec,
} from "@/lib/quasar-client";

export type ActivityKind =
  | "created"
  | "deposit"
  | "gift"
  | "withdraw"
  | "monthly"
  | "bonus"
  | "closed";

export type ActivityEntry = {
  kind: ActivityKind;
  amountUsd: number;
  ts: number;
  sig: string;
  /** depositor wallet for deposits/gifts; undefined otherwise */
  from?: string;
  /** gifter's self-chosen name from the seedling-gift memo */
  fromName?: string;
};

const PROGRAM_LOG_PREFIX = "Program data: ";
const MEMO_LOG_RE = /Program log: Memo \(len \d+\): "seedling-gift:([^"]*)"/;

function extractGiftMemo(logs: string[]): string | null {
  for (const line of logs) {
    const m = MEMO_LOG_RE.exec(line);
    if (m) return m[1].trim();
  }
  return null;
}

// Module-level cache per family — subsequent polls only decode the
// signatures we haven't already processed. Survives across re-renders.
const activityCache = new Map<string, Map<string, ActivityEntry>>();

export async function fetchFamilyActivity(
  connection: Connection,
  familyPda: PublicKey,
  limit = 25
): Promise<ActivityEntry[]> {
  const cacheKey = familyPda.toBase58();
  const cached =
    activityCache.get(cacheKey) ?? new Map<string, ActivityEntry>();

  const sigs = await connection.getSignaturesForAddress(familyPda, {
    limit,
  });
  if (sigs.length === 0) {
    return [...cached.values()].sort((a, b) => b.ts - a.ts);
  }

  const missing = sigs.filter((s) => !cached.has(s.signature));
  if (missing.length === 0) {
    return [...cached.values()].sort((a, b) => b.ts - a.ts);
  }

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
    const giftMemo = extractGiftMemo(tx.meta.logMessages);

    for (const line of tx.meta.logMessages) {
      if (!line.startsWith(PROGRAM_LOG_PREFIX)) continue;
      const b64 = line.slice(PROGRAM_LOG_PREFIX.length);
      try {
        const bytes = Buffer.from(b64, "base64");
        const disc = bytes[0];
        const payload = bytes.subarray(1);
        const entry = decodeEvent(disc, payload, sig, giftMemo);
        if (entry) cached.set(sig, entry);
      } catch {
        // Not a recognized event or decode failure — skip.
      }
    }
  });

  activityCache.set(cacheKey, cached);
  return [...cached.values()].sort((a, b) => b.ts - a.ts);
}

function decodeEvent(
  disc: number,
  payload: Uint8Array,
  sig: string,
  giftMemo: string | null
): ActivityEntry | null {
  if (disc === FAMILY_CREATED_DISCRIMINATOR[0]) {
    const d = FamilyCreatedCodec.decode(payload);
    return {
      kind: "created",
      amountUsd: 0,
      ts: Number(d.ts),
      sig,
    };
  }
  if (disc === DEPOSITED_DISCRIMINATOR[0]) {
    const d = DepositedCodec.decode(payload);
    const isGift = giftMemo !== null;
    return {
      kind: isGift ? "gift" : "deposit",
      amountUsd: Number(d.amount) / 1_000_000,
      ts: Number(d.ts),
      sig,
      from: d.depositor.toBase58(),
      fromName: isGift && giftMemo!.length > 0 ? giftMemo! : undefined,
    };
  }
  if (disc === WITHDRAWN_DISCRIMINATOR[0]) {
    const d = WithdrawnCodec.decode(payload);
    return {
      kind: "withdraw",
      amountUsd: Number(d.assetsOut) / 1_000_000,
      ts: Number(d.ts),
      sig,
    };
  }
  if (disc === MONTHLY_ALLOWANCE_DISTRIBUTED_DISCRIMINATOR[0]) {
    const d = MonthlyAllowanceDistributedCodec.decode(payload);
    // Total amount routed to the kid pool = principal drawdown + yield drawdown.
    const amount =
      Number(d.principalDrawdown) / 1_000_000 +
      Number(d.yieldDrawdown) / 1_000_000;
    return {
      kind: "monthly",
      amountUsd: amount,
      ts: Number(d.ts),
      sig,
    };
  }
  if (disc === BONUS_DISTRIBUTED_DISCRIMINATOR[0]) {
    const d = BonusDistributedCodec.decode(payload);
    return {
      kind: "bonus",
      amountUsd: Number(d.amount) / 1_000_000,
      ts: Number(d.ts),
      sig,
    };
  }
  if (disc === FAMILY_CLOSED_DISCRIMINATOR[0]) {
    const d = FamilyClosedCodec.decode(payload);
    return {
      kind: "closed",
      amountUsd: Number(d.assetsPaidOut) / 1_000_000,
      ts: Number(d.ts),
      sig,
    };
  }
  return null;
}
