import { BN } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { PROGRAM_ID } from "./program";
import {
  FAMILY_POSITION_DISCRIMINATOR,
  FamilyPositionCodec,
} from "./quasar-client";
import { familyPositionPda } from "./quasarPdas";
import { getDraftFamilies } from "./draftFamilies";

/**
 * FamilyPosition account total size on-chain (Quasar layout):
 * 1 disc + 32 parent + 32 kid + 8 shares + 8 principal_deposited
 * + 8 principal_remaining + 8 stream_rate + 8 created_at
 * + 8 last_distribution + 4 last_bonus_period_id + 8 total_yield_earned
 * + 1 bump = 126 bytes.
 *
 * Anchor v1 was 133 bytes (8-byte discriminator). Quasar's 1-byte
 * discriminator saves 7 bytes per account.
 */
const FAMILY_POSITION_SIZE = 126;

/**
 * Backward-compat shape — preserved as BN-typed bigints so existing UI code
 * that does .toString() / .toNumber() / BN math doesn't break. The Quasar
 * codec produces native bigints; we wrap them at the boundary here.
 */
export type FamilyView = {
  pubkey: PublicKey;
  parent: PublicKey;
  kid: PublicKey;
  shares: BN;
  principalDeposited: BN;
  principalRemaining: BN;
  streamRate: BN;
  createdAt: BN;
  lastDistribution: BN;
  lastBonusPeriodId: number;
  totalYieldEarned: BN;
  bump: number;
  /** true when the family exists only in localStorage (no on-chain
   *  account yet). Drafts get promoted to on-chain at first deposit;
   *  this flag is what lets the UI render reduced affordances (no
   *  withdraw / no distribute / no yield ticker) for unfunded families. */
  isDraft: boolean;
};

/**
 * Fetch all FamilyPosition PDAs where parent == owner.
 *
 * Filter strategy:
 *   1. dataSize 126 — only FamilyPosition accounts under Quasar layout
 *   2. memcmp at offset 0  — Quasar 1-byte discriminator (= 2)
 *   3. memcmp at offset 1  — parent pubkey (32 bytes; first field after disc)
 *
 * Note: param signature dropped Program<Seedling> after Quasar cutover.
 * Callers should pass connection + parent only.
 */
export async function fetchFamiliesForParent(
  connection: Connection,
  parent: PublicKey
): Promise<FamilyView[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { dataSize: FAMILY_POSITION_SIZE },
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(Buffer.from(FAMILY_POSITION_DISCRIMINATOR)),
        },
      },
      { memcmp: { offset: 1, bytes: parent.toBase58() } },
    ],
    commitment: "confirmed",
  });

  const onChain: FamilyView[] = accounts
    .map(({ pubkey, account }) => {
      const decoded = FamilyPositionCodec.decode(account.data.subarray(1));
      return {
        pubkey,
        parent: decoded.parent,
        kid: decoded.kid,
        shares: new BN(decoded.shares.toString()),
        principalDeposited: new BN(decoded.principalDeposited.toString()),
        principalRemaining: new BN(decoded.principalRemaining.toString()),
        streamRate: new BN(decoded.streamRate.toString()),
        createdAt: new BN(decoded.createdAt.toString()),
        lastDistribution: new BN(decoded.lastDistribution.toString()),
        lastBonusPeriodId: decoded.lastBonusPeriodId,
        totalYieldEarned: new BN(decoded.totalYieldEarned.toString()),
        bump: decoded.bump,
        isDraft: false,
      };
    })
    .filter((family) => {
      // v3 cutover filter: re-derive the family PDA from (parent, kid)
      // using the current seeds (family_v3). Only families whose on-chain
      // address matches the v3 derivation are valid; v2 zombies derive
      // to a different PDA and get dropped from the dashboard.
      const expected = familyPositionPda(family.parent, family.kid);
      return expected.toBase58() === family.pubkey.toBase58();
    });

  // Layer drafts (localStorage) on top, dropping any draft whose kid
  // already has an on-chain family — that means the first deposit
  // promoted the draft and we should let the on-chain record win.
  const onChainKids = new Set(onChain.map((f) => f.kid.toBase58()));
  const drafts = getDraftFamilies(parent.toBase58())
    .filter((d) => !onChainKids.has(d.kid))
    .map((d): FamilyView => {
      const parentPk = new PublicKey(d.parent);
      const kidPk = new PublicKey(d.kid);
      const familyPda = familyPositionPda(parentPk, kidPk);
      const streamBaseUnits = Math.round(d.monthlyUsd * 1_000_000);
      return {
        pubkey: familyPda,
        parent: parentPk,
        kid: kidPk,
        shares: new BN(0),
        principalDeposited: new BN(0),
        principalRemaining: new BN(0),
        streamRate: new BN(streamBaseUnits),
        // Both timestamps point at draft creation. The kid view's
        // "ago" labels still read sensibly; on-chain bumps these
        // forward at first deposit so subsequent fetches show the
        // real created_at.
        createdAt: new BN(d.createdAt),
        lastDistribution: new BN(d.createdAt),
        lastBonusPeriodId: 0,
        totalYieldEarned: new BN(0),
        bump: 0, // unknown until on-chain create_family runs
        isDraft: true,
      };
    });

  return [...onChain, ...drafts];
}
