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

import { Connection, PublicKey } from "@solana/web3.js";

/** Canonical Seedling program ID — Quasar binary deployed at this address.
 *  Same keypair was used on devnet during development and on mainnet for
 *  the production deploy, so the address is identical on both clusters. */
export const PROGRAM_ID = new PublicKey(
  "44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN"
);

// Mainnet Helius RPC. We extract the API key from NEXT_PUBLIC_HELIUS_RPC
// and always rebuild as the mainnet URL — that way an env var still
// pointing at a devnet/testnet endpoint can't accidentally route a
// signed mainnet transaction to the wrong cluster (which fails with the
// opaque "Blockhash not found" simulation error). Public mainnet fallback
// 403s browsers but at least it's the right cluster.
const HELIUS_KEY =
  process.env.NEXT_PUBLIC_HELIUS_RPC?.match(/api-key=([^&]+)/)?.[1] ?? "";
export const MAINNET_RPC = HELIUS_KEY
  ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`
  : "https://api.mainnet-beta.solana.com";

// Mainnet addresses. Vault PDAs derived against the canonical PROGRAM_ID;
// static USDC/Kamino/oracle pubkeys pulled from
// ~/refs/mainnet-kamino-pubkeys.json.
export const MAINNET_ADDRESSES = {
  // Quasar PDA — derived from "vault_config_v2" seed + PROGRAM_ID
  vaultConfig: new PublicKey("G9wKFXscALKeqHVCmouaKWTUqcMgSqErJiervW1PWiuc"),
  // Treasury ATA — owned by Vicenzo's SafePal wallet (8eTTFs…2N95cV).
  // Initialized 2026-05-15 by the mainnet init script; receives 10% of
  // every cToken redeem (withdraw + monthly + bonus distribute) in USDC.
  treasury: new PublicKey("ERJkwnMr6AS6ai8ck4PB5dawfb4SLeV3avskpgGCPwMk"),
  // Vault PDA-owned ATAs (mainnet)
  vaultUsdcAta: new PublicKey("ANXoMvjJoR2vTdqtuo2V45d8uSs3FLbcH4uzWoe5SWWQ"),
  vaultCtokenAta: new PublicKey("7L91kYfDApdqCGBvdrnECSJKhYPZbyYHgzFsmeWrimLd"),
  // ↓ upstream Solana / Kamino mainnet addresses
  usdcMint: new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
  ctokenMint: new PublicKey("B8V6WVjPxW1UGwVDfxH2d2r8SyT4cqn7dQRK6XneVa7D"),
  kaminoReserve: new PublicKey("D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59"),
  kaminoMarket: new PublicKey("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF"),
  klendProgram: new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"),
  reserveLiquiditySupply: new PublicKey(
    "Bgq7trRgVMeq33yt235zM2onQ4bRDBsY5EWiTetF4qw6"
  ),
  // Mainnet USDC reserve uses Scope ONLY. The pyth field is now retained
  // for type compatibility but holds the klend-program sentinel (unused).
  // See GOTCHAS §15: optional oracle slots accept the target program ID
  // as the "None" sentinel.
  oraclePyth: new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"),
  oracleScopeConfig: new PublicKey(
    "3t4JZcueEzTbVP6kLxXrL3VpWx45jDer4eqysweBchNH"
  ),
};

// Sponsor wallet that pays rent + tx fees for users without SOL (Privy
// embedded wallets, all create_family relays). Pubkey is public-safe;
// the corresponding secret lives only in server env (SEEDLING_HOT_WALLET_*).
// Kept in sync with .env.local SEEDLING_HOT_WALLET_PUBKEY.
export const SPONSOR_WALLET = new PublicKey(
  "53Jn8XAG9nhkekz6NP2a4qYWcGxJBBoDqLJMUvHkKyc4"
);

export function getConnection(): Connection {
  return new Connection(MAINNET_RPC, "confirmed");
}
