// Wallet-free FamilyPosition fetcher for the public kid view.
//
// The kid page renders for anyone with the link (grandparents,
// classmates, the kid themselves on a school computer). They have no
// wallet adapter, so we build a no-signer Program instance and reuse
// its coder — same case-conversion logic as the dashboard, no
// subtle PascalCase/camelCase bug from raw BorshAccountsCoder.

import { AnchorProvider, Idl, Program, Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import idl from "./idl.json";
import type { FamilyView } from "./fetchFamilies";
import type { Seedling } from "./types";

let program: Program<Seedling> | null = null;
let cachedConnection: Connection | null = null;
function getProgram(connection: Connection): Program<Seedling> {
  if (program && cachedConnection === connection) return program;
  // Dummy wallet — no signing happens, this Program is read-only.
  const wallet = new Wallet(Keypair.generate());
  const provider = new AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  program = new Program(idl as Idl, provider) as unknown as Program<Seedling>;
  cachedConnection = connection;
  return program;
}

export async function fetchFamilyByPda(
  connection: Connection,
  familyPda: PublicKey
): Promise<FamilyView | null> {
  const info = await connection.getAccountInfo(familyPda, "confirmed");
  if (!info) return null;
  const decoded = getProgram(connection).coder.accounts.decode(
    "familyPosition",
    info.data
  ) as Omit<FamilyView, "pubkey">;
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
  const decoded = getProgram(connection).coder.accounts.decode(
    "vaultConfig",
    info.data
  ) as {
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
