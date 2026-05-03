// Wallet-free FamilyPosition fetcher for the public kid view.
//
// The kid page renders for anyone with the link (grandparents,
// classmates, the kid themselves on a school computer). They have no
// wallet adapter, so we use the Quasar codec directly — no Provider/
// Program plumbing needed.

import { BN } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  FAMILY_POSITION_DISCRIMINATOR,
  FamilyPositionCodec,
  VAULT_CONFIG_DISCRIMINATOR,
  VaultConfigCodec,
} from "./quasar-client";
import type { FamilyView } from "./fetchFamilies";

export async function fetchFamilyByPda(
  connection: Connection,
  familyPda: PublicKey
): Promise<FamilyView | null> {
  const info = await connection.getAccountInfo(familyPda, "confirmed");
  if (!info) return null;
  if (info.data[0] !== FAMILY_POSITION_DISCRIMINATOR[0]) return null;

  const decoded = FamilyPositionCodec.decode(info.data.subarray(1));
  return {
    pubkey: familyPda,
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
}

export type VaultClock = {
  totalShares: bigint;
  lastKnownTotalAssets: bigint;
  periodEndTs: number;
  currentPeriodId: number;
  cycleMonths: number;
};

export async function fetchVaultClock(
  connection: Connection,
  vaultConfigPda: PublicKey
): Promise<VaultClock | null> {
  const info = await connection.getAccountInfo(vaultConfigPda, "confirmed");
  if (!info) return null;
  if (info.data[0] !== VAULT_CONFIG_DISCRIMINATOR[0]) return null;

  const decoded = VaultConfigCodec.decode(info.data.subarray(1));
  return {
    totalShares: decoded.totalShares,
    lastKnownTotalAssets: decoded.lastKnownTotalAssets,
    periodEndTs: Number(decoded.periodEndTs),
    currentPeriodId: decoded.currentPeriodId,
    // Quasar VaultConfig doesn't carry cycle_months yet — default to 12
    // (annual). Add the field on-chain in a future schema migration if we
    // ever need other cadences.
    cycleMonths: 12,
  };
}

/** Human label for cycle_months. Used in kid view + dashboard footers. */
export function cycleLabel(cycleMonths: number): string {
  switch (cycleMonths) {
    case 6:
      return "semi-annual";
    case 12:
      return "annual";
    case 18:
      return "18-month";
    case 24:
      return "biennial";
    default:
      return `${cycleMonths}-month`;
  }
}
