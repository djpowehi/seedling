// Helper for instantiating the Seedling client.
//
// CUTOVER NOTE (2026-05-03): PROGRAM_ID now points at the Quasar deployment
// (EQtCpic4...) instead of the Anchor deployment (44vix4Jm...). Frontend
// instruction calls have moved from program.methods.foo().rpc() (Anchor)
// to client.createFooInstruction(...) + sendQuasarIx() (Quasar). Account
// decoders use FamilyPositionCodec / VaultConfigCodec from quasar-client.
//
// Vault PDAs are now derived at runtime via lib/quasarPdas.ts because the
// program ID change re-derives every PDA. ATAs are derived at runtime via
// getAssociatedTokenAddress(usdcMint, vaultConfig, allowOwnerOffCurve=true).

import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import idl from "./idl.json";
import type { Seedling } from "./types";

/** Quasar deployment (test-deploy at EQtCpic4..., redeployed to canonical
 * 44vix4Jm... before mainnet launch). */
export const PROGRAM_ID = new PublicKey(
  "EQtCpic4xr3N4wmyDcZNPT9oimbaheHykmxJGs7EQyLr"
);

/** Anchor deployment — kept here as a fallback during cutover for any
 * lingering reads against the old vault. Remove after frontend cutover
 * verified working. */
export const LEGACY_ANCHOR_PROGRAM_ID = new PublicKey(
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
  vaultConfig: new PublicKey("8Y9ufsznBkhQSrQvgKBqLBjXxAfGuZEY9gy5CiX56mY4"),
  // Treasury keypair-owned ATA (separate from any depositor's ATA — see
  // treasury_keypair commit comment for rationale)
  treasury: new PublicKey("6Pbtx9cSo8WtsxMBwMqvt7XbCZFat81NvHz1JoSRrkCW"),
  // Vault PDA-owned ATAs (re-derived against new vault_config)
  vaultUsdcAta: new PublicKey("FeLSvm5NejhXcrg3mrjpnqTN8vL3cec19MMDsFQ8MJY9"),
  vaultCtokenAta: new PublicKey("A3QAWo3T9qgT4TUudookXAffBqVFx5HEfQMXfYJcou8w"),
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

export function getProgram(provider: AnchorProvider): Program<Seedling> {
  return new Program(idl as Idl, provider) as unknown as Program<Seedling>;
}

export function getConnection(): Connection {
  return new Connection(DEVNET_RPC, "confirmed");
}
