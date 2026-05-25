// Server-side helpers for the keeper cron: enumerate every FamilyPosition
// on mainnet, fetch VaultConfig, and decide who's eligible for monthly
// allowance / 13th-allowance bonus today.
//
// Eligibility rules (see master doc §4 + the comment in
// programs/seedling-quasar/src/instructions/create_family.rs):
//
//   monthly  = stream_rate > 0
//              AND today is the 1st of the calendar month (UTC)
//              AND on-chain 30-day cooldown has elapsed
//
//   bonus    = stream_rate > 0
//              AND now >= vault.period_end_ts
//              AND family.last_bonus_period_id < vault.current_period_id
//
// The on-chain 30-day gate is the safety floor — calendar-1st enforcement
// lives here because it's a UX/scheduling rule, not a protocol invariant.

import { Connection, PublicKey } from "@solana/web3.js";

import {
  FAMILY_POSITION_DISCRIMINATOR,
  FamilyPositionCodec,
  VaultConfigCodec,
  type FamilyPosition,
  type VaultConfig,
} from "./quasar-client";
import { MAINNET_ADDRESSES, PROGRAM_ID } from "./program";

export type FamilyWithPubkey = FamilyPosition & { pubkey: PublicKey };

// Must mirror programs/seedling-quasar/src/instructions/distribute_monthly_allowance.rs::MONTHLY_GATE_SECS
export const MONTHLY_GATE_SECS = 30 * 24 * 60 * 60;

export async function fetchAllFamilies(
  connection: Connection
): Promise<FamilyWithPubkey[]> {
  const accs = await connection.getProgramAccounts(PROGRAM_ID, {
    commitment: "confirmed",
    filters: [{ dataSize: 126 }],
  });
  const families: FamilyWithPubkey[] = [];
  for (const { pubkey, account } of accs) {
    if (account.data[0] !== FAMILY_POSITION_DISCRIMINATOR[0]) continue;
    try {
      const decoded = FamilyPositionCodec.decode(
        account.data.subarray(1)
      ) as FamilyPosition;
      families.push({ ...decoded, pubkey });
    } catch {
      // Malformed bytes — skip rather than abort the whole keeper run.
    }
  }
  return families;
}

export async function fetchVaultConfig(
  connection: Connection
): Promise<VaultConfig> {
  const info = await connection.getAccountInfo(
    MAINNET_ADDRESSES.vaultConfig,
    "confirmed"
  );
  if (!info) throw new Error("VaultConfig not found on mainnet");
  return VaultConfigCodec.decode(info.data.subarray(1)) as VaultConfig;
}

export function isTodayFirstOfMonthUTC(nowMs: number = Date.now()): boolean {
  return new Date(nowMs).getUTCDate() === 1;
}

export function isMonthlyEligible(
  family: FamilyPosition,
  nowSec: number,
  todayIsFirstUTC: boolean
): boolean {
  if (family.streamRate === BigInt(0)) return false;
  if (!todayIsFirstUTC) return false;
  return nowSec >= Number(family.lastDistribution) + MONTHLY_GATE_SECS;
}

export function isBonusEligible(
  family: FamilyPosition,
  vault: VaultConfig,
  nowSec: number
): boolean {
  if (family.streamRate === BigInt(0)) return false;
  if (nowSec < Number(vault.periodEndTs)) return false;
  return family.lastBonusPeriodId < vault.currentPeriodId;
}
