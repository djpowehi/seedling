// Helper for instantiating the Seedling Anchor client.
//
// CONVENTION (per repo GOTCHAS.md #3): when calling instructions, use
// `.accountsPartial({...})` not `.accounts({...})`. Anchor 0.32.1's TS client
// can't auto-resolve PDA-owned ATAs; passing them explicitly via Partial
// keeps the build deterministic. Documented once here, applies everywhere.

import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl.json";
import type { Seedling } from "./types";

export const PROGRAM_ID = new PublicKey(
  "44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN"
);

// Prefer Helius devnet RPC when configured (free tier, ~10x faster). Falls
// back to public devnet which works but rate-limits aggressively. Set
// NEXT_PUBLIC_HELIUS_RPC in .env.local locally and in Vercel project
// settings for production.
export const DEVNET_RPC =
  process.env.NEXT_PUBLIC_HELIUS_RPC ?? "https://api.devnet.solana.com";

// Devnet addresses captured at deploy time. Source of truth:
// ~/refs/seedling-devnet-addresses.json (kept off-repo for safety).
export const DEVNET_ADDRESSES = {
  vaultConfig: new PublicKey("FNPCZh1LLd7u3WG4W9h67V1p22gierebDPAb7PBy1sz7"),
  treasury: new PublicKey("6KMyigbv4hU7N3cm5mRj4k9npz3hMuxkguCJyKaKrCDJ"),
  vaultUsdcAta: new PublicKey("5GQBtK4QWHVYXF362hF17T8BfavB2uAmg4E8s538bGb"),
  vaultCtokenAta: new PublicKey("2MGpBamYwMoaHUMpewsA9GpsjFji5WivKwopPLsXSZfG"),
  usdcMint: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"),
  ctokenMint: new PublicKey("6FY2rwh5wWrtSveAG9t9ANc2YsrChNasVSEpMQubJcXd"),
  kaminoReserve: new PublicKey("HRwMj8uuoGVWCanKzKvpTWN5ZvXjtjKGxcFbn2qTPKMW"),
  kaminoMarket: new PublicKey("6aaNTBEmwdN19AAdTwbNrWyUo6iEyiLguxCTePEzSqoH"),
  klendProgram: new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"),
  reserveLiquiditySupply: new PublicKey(
    "6icVFmuKEsH5dzDwTSrxzrnJ14N27gDKRc2XAxPtB4ep"
  ),
  // Devnet USDC reserve uses Pyth only.
  oraclePyth: new PublicKey("Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"),
};

export function getProgram(provider: AnchorProvider): Program<Seedling> {
  return new Program(idl as Idl, provider) as unknown as Program<Seedling>;
}

export function getConnection(): Connection {
  return new Connection(DEVNET_RPC, "confirmed");
}
