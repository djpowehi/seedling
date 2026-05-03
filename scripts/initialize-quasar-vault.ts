// Initialize the Quasar vault on devnet.
//
// Run with:
//   ANCHOR_WALLET=~/.config/solana/id.json \
//   ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//   npx tsx scripts/initialize-quasar-vault.ts
//
// Targets the canonical program at 44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN.
//
// Idempotent: if the vault_config PDA already exists, the script logs and
// exits 0 instead of erroring. Re-run is safe.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import { SeedlingQuasarClient } from "../frontend/lib/quasar-client";
import { vaultConfigPda } from "../frontend/lib/quasarPdas";

// Devnet addresses (same as the Anchor program — same Kamino reserve).
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const CTOKEN_MINT = new PublicKey("6FY2rwh5wWrtSveAG9t9ANc2YsrChNasVSEpMQubJcXd");
const KAMINO_RESERVE = new PublicKey(
  "HRwMj8uuoGVWCanKzKvpTWN5ZvXjtjKGxcFbn2qTPKMW"
);
// Devnet USDC reserve uses Pyth only.
const ORACLE_PYTH = new PublicKey(
  "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"
);

const KEYPAIR_PATH = path.join(os.homedir(), ".config/solana/id.json");
const RPC = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";

async function main() {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8")))
  );
  const connection = new Connection(RPC, "confirmed");
  const client = new SeedlingQuasarClient();

  console.log("Wallet:        ", wallet.publicKey.toBase58());
  console.log("Program:       ", SeedlingQuasarClient.programId.toBase58());

  // Override the PROGRAM_ID-dependent PDA derivation. quasarPdas defaults
  // to the import-time PROGRAM_ID, but we're using the test address.
  const programId = SeedlingQuasarClient.programId;
  const [vaultConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config_v2")],
    programId
  );
  console.log("vault_config:  ", vaultConfig.toBase58());

  // Idempotent guard.
  const existing = await connection.getAccountInfo(vaultConfig);
  if (existing) {
    console.log("\nvault_config already initialized. Skipping.");
    console.log(`  data_len: ${existing.data.length}`);
    console.log(`  owner:    ${existing.owner.toBase58()}`);
    return;
  }

  // Treasury ATA — owned by a SEPARATE keypair so it's never the same as a
  // depositor's ATA (otherwise deposit fails with AccountBorrowFailed when
  // depositor_usdc_ata == treasury_usdc_ata as two writable slots).
  // The treasury keypair just holds the address; we don't need to sign
  // with it — the ATA is owned by it but receives transfers, never sends.
  const TREASURY_OWNER = process.env.TREASURY_OWNER
    ? new PublicKey(process.env.TREASURY_OWNER)
    : new PublicKey("6dkYhc2QN1NjhhUjMr5zJnYXTovYFiaHvfd2Tq3w1EGB");
  const treasuryAta = await getAssociatedTokenAddress(
    USDC_MINT,
    TREASURY_OWNER,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  // Vault USDC + cToken ATAs — derived against vault_config (PDA).
  const vaultUsdcAta = await getAssociatedTokenAddress(
    USDC_MINT,
    vaultConfig,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const vaultCtokenAta = await getAssociatedTokenAddress(
    CTOKEN_MINT,
    vaultConfig,
    true,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  console.log("treasury_ata:  ", treasuryAta.toBase58());
  console.log("vault_usdc_ata:", vaultUsdcAta.toBase58());
  console.log("vault_ctoken:  ", vaultCtokenAta.toBase58());

  // Period end: 1 year from now.
  const periodEndTs = BigInt(Math.floor(Date.now() / 1000) + 365 * 86400);

  const initIx = client.createInitializeVaultInstruction({
    authority: wallet.publicKey,
    vaultConfig,
    usdcMint: USDC_MINT,
    ctokenMint: CTOKEN_MINT,
    treasuryUsdcAta: treasuryAta,
    kaminoReserve: KAMINO_RESERVE,
    vaultUsdcAta,
    vaultCtokenAta,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    args: {
      oraclePyth: ORACLE_PYTH,
      oracleSwitchboardPrice: PublicKey.default,
      oracleSwitchboardTwap: PublicKey.default,
      oracleScopeConfig: PublicKey.default,
      periodEndTs,
      feeBps: 2500, // 25%
    },
  });

  // Treasury ATA may not exist yet. Create idempotently in same tx.
  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    wallet.publicKey,    // payer
    treasuryAta,
    TREASURY_OWNER,      // ATA owner = the separate treasury keypair
    USDC_MINT
  );

  const tx = new Transaction().add(ataIx).add(initIx);
  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(wallet);

  console.log("\nSending initialize_vault...");
  const sig = await connection.sendRawTransaction(tx.serialize());
  console.log(`tx: ${sig}`);
  console.log(`https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  await connection.confirmTransaction(sig, "confirmed");
  console.log("✅ confirmed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
