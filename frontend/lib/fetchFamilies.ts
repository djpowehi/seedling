import { BN, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { PROGRAM_ID } from "./program";
import type { Seedling } from "./types";

/**
 * Anchor account discriminator for FamilyPosition.
 * Verified against frontend/lib/idl.json — sha256("account:FamilyPosition")[..8].
 */
const FAMILY_POSITION_DISCRIMINATOR = Buffer.from([
  36, 165, 172, 151, 135, 133, 205, 110,
]);

/**
 * FamilyPosition account total size on-chain.
 * 8 disc + 32 parent + 32 kid + 8 shares + 8 principal_deposited
 * + 8 principal_remaining + 8 stream_rate + 8 created_at
 * + 8 last_distribution + 4 last_bonus_period_id + 8 total_yield_earned + 1 bump = 133
 */
const FAMILY_POSITION_SIZE = 133;

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
 * Filter strategy (cheap on devnet, tight on mainnet):
 *   1. dataSize 133 — only FamilyPosition accounts
 *   2. memcmp at offset 0  — Anchor account discriminator
 *   3. memcmp at offset 8  — parent pubkey (32 bytes)
 *
 * Verified offset: see programs/seedling/src/state/family_position.rs:19
 *   #[account] FamilyPosition { parent: Pubkey, ... }
 *   8 (discriminator) + 0 (parent is first field) = 8
 */
export async function fetchFamiliesForParent(
  connection: Connection,
  program: Program<Seedling>,
  parent: PublicKey
): Promise<FamilyView[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      { dataSize: FAMILY_POSITION_SIZE },
      {
        memcmp: {
          offset: 0,
          bytes: bs58.encode(FAMILY_POSITION_DISCRIMINATOR),
        },
      },
      { memcmp: { offset: 8, bytes: parent.toBase58() } },
    ],
    commitment: "confirmed",
  });

  return accounts.map(({ pubkey, account }) => {
    const decoded = program.coder.accounts.decode(
      "familyPosition",
      account.data
    ) as FamilyView;
    return { ...decoded, pubkey };
  });
}
