import { BN } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { PROGRAM_ID } from "./program";
import {
  FAMILY_POSITION_DISCRIMINATOR,
  FamilyPositionCodec,
} from "./quasar-client";

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

  return accounts.map(({ pubkey, account }) => {
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
    };
  });
}
