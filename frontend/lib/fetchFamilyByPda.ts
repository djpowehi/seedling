// Wallet-free FamilyPosition fetcher for the public kid view.
//
// The kid page renders for anyone with the link (grandparents,
// classmates, the kid themselves on a school computer). They have no
// wallet adapter, so we build a no-signer Program instance and reuse
// its coder — same case-conversion logic as the dashboard, no
// subtle PascalCase/camelCase bug from raw BorshAccountsCoder.

import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import idl from "./idl.json";
import type { FamilyView } from "./fetchFamilies";
import type { Seedling } from "./types";

// `Wallet` from @coral-xyz/anchor is a Node-only export (it reads a
// keypair file). Browsers can't import it. We only need a Wallet-shaped
// object to instantiate a read-only Program — no signing happens here,
// so a stub that throws on any signing call is safe.
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

let program: Program<Seedling> | null = null;
let cachedConnection: Connection | null = null;
function getProgram(connection: Connection): Program<Seedling> {
  if (program && cachedConnection === connection) return program;
  const provider = new AnchorProvider(connection, stubWallet, {
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
  cycleMonths: number;
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
    // Optional — only present once the program is redeployed with the
    // cycle_months field. Devnet still runs the old binary so this is
    // undefined there. We fall back to 12 (annual) for the UI label.
    cycleMonths?: number;
  };
  return {
    totalShares: BigInt(decoded.totalShares.toString()),
    lastKnownTotalAssets: BigInt(decoded.lastKnownTotalAssets.toString()),
    periodEndTs: Number(decoded.periodEndTs.toString()),
    currentPeriodId: Number(decoded.currentPeriodId),
    cycleMonths:
      typeof decoded.cycleMonths === "number" ? decoded.cycleMonths : 12,
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
