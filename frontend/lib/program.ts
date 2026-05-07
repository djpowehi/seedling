// Helper for instantiating the Seedling client.
//
// PROGRAM_ID is the canonical Seedling address (44vix4Jm...) — same one
// referenced in the README, Anchor.toml, and the deck. Quasar binary is
// the deployed program. Frontend instruction calls go through
// client.createFooInstruction(...) + sendQuasarIx(); account decoders
// use FamilyPositionCodec / VaultConfigCodec from quasar-client.
//
// Vault PDAs are derived at runtime via lib/quasarPdas.ts. ATAs use
// getAssociatedTokenAddress(usdcMint, vaultConfig, allowOwnerOffCurve=true).

import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl.json";
import type { Seedling } from "./types";

/** Canonical Seedling program ID — Quasar binary deployed at this address
 *  on devnet (and the address slated for mainnet). */
export const PROGRAM_ID = new PublicKey(
  "44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN"
);

// Prefer Helius devnet RPC when configured (free tier, ~10x faster). Falls
// back to public devnet which works but rate-limits aggressively. Set
// NEXT_PUBLIC_HELIUS_RPC in .env.local locally and in Vercel project
// settings for production.
export const DEVNET_RPC =
  process.env.NEXT_PUBLIC_HELIUS_RPC ?? "https://api.devnet.solana.com";

// Devnet addresses, post Quasar cutover (2026-05-03). Vault PDAs and ATAs
// re-derived against the new PROGRAM_ID; static USDC/Kamino/oracle pubkeys
// unchanged (those are upstream protocol addresses).
export const DEVNET_ADDRESSES = {
  // Quasar PDA — derived from "vault_config" seed + new PROGRAM_ID
  vaultConfig: new PublicKey("G9wKFXscALKeqHVCmouaKWTUqcMgSqErJiervW1PWiuc"),
  // Treasury keypair-owned ATA (separate from any depositor's ATA — see
  // treasury_keypair commit comment for rationale)
  treasury: new PublicKey("6Pbtx9cSo8WtsxMBwMqvt7XbCZFat81NvHz1JoSRrkCW"),
  // Vault PDA-owned ATAs (re-derived against canonical-deploy vault_config)
  vaultUsdcAta: new PublicKey("3fwECawRAkvPfVR3Zb7RNULq8Hs1PEwSsWE24bv9kkXL"),
  vaultCtokenAta: new PublicKey("3V45nZEtxfsWxVg4Y83bZti8Gikm4qz6KzPvDzb6R367"),
  // ↓ unchanged — these are upstream addresses
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

// Sponsor wallet that pays rent + tx fees for users without SOL (Privy
// embedded wallets, all create_family relays). Pubkey is public-safe;
// the corresponding secret lives only in server env (SEEDLING_HOT_WALLET_*).
// Kept in sync with .env.local SEEDLING_HOT_WALLET_PUBKEY.
export const SPONSOR_WALLET = new PublicKey(
  "53Jn8XAG9nhkekz6NP2a4qYWcGxJBBoDqLJMUvHkKyc4"
);

export function getProgram(provider: AnchorProvider): Program<Seedling> {
  return new Program(idl as Idl, provider) as unknown as Program<Seedling>;
}

export function getConnection(): Connection {
  return new Connection(DEVNET_RPC, "confirmed");
}
