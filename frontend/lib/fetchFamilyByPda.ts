// Wallet-free FamilyPosition fetcher for the public kid view.
//
// The kid page renders for anyone with the link (grandparents,
// classmates, the kid themselves on a school computer). They have no
// wallet adapter, so we cannot use the AnchorProvider/Program path
// from useSeedlingProgram. Instead we decode the account bytes
// directly with Anchor's BorshAccountsCoder.

import { BorshAccountsCoder, Idl } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl.json";
import type { FamilyView } from "./fetchFamilies";

let coder: BorshAccountsCoder | null = null;
function getCoder(): BorshAccountsCoder {
  if (!coder) coder = new BorshAccountsCoder(idl as Idl);
  return coder;
}

export async function fetchFamilyByPda(
  connection: Connection,
  familyPda: PublicKey
): Promise<FamilyView | null> {
  const info = await connection.getAccountInfo(familyPda, "confirmed");
  if (!info) return null;
  const decoded = getCoder().decode("familyPosition", info.data) as Omit<
    FamilyView,
    "pubkey"
  >;
  return { ...decoded, pubkey: familyPda };
}

export type VaultClock = {
  totalShares: bigint;
  lastKnownTotalAssets: bigint;
  periodEndTs: number;
  currentPeriodId: number;
};

export async function fetchVaultClock(
  connection: Connection,
  vaultConfigPda: PublicKey
): Promise<VaultClock | null> {
  const info = await connection.getAccountInfo(vaultConfigPda, "confirmed");
  if (!info) return null;
  const decoded = getCoder().decode("vaultConfig", info.data) as {
    totalShares: { toString(): string };
    lastKnownTotalAssets: { toString(): string };
    periodEndTs: { toString(): string };
    currentPeriodId: number;
  };
  return {
    totalShares: BigInt(decoded.totalShares.toString()),
    lastKnownTotalAssets: BigInt(decoded.lastKnownTotalAssets.toString()),
    periodEndTs: Number(decoded.periodEndTs.toString()),
    currentPeriodId: Number(decoded.currentPeriodId),
  };
}
