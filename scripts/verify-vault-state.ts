// Read the on-chain VaultConfig and decode it via the Quasar codec.
// Proves end-to-end: program wrote bytes; client reads bytes; layouts match.

import { Connection, PublicKey } from "@solana/web3.js";
import {
  SeedlingQuasarClient,
  VaultConfigCodec,
  VAULT_CONFIG_DISCRIMINATOR,
} from "../frontend/lib/quasar-client";

const RPC = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const programId = SeedlingQuasarClient.programId;
  const [vaultConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config_v2")],
    programId
  );

  console.log("Reading", vaultConfig.toBase58());
  const info = await connection.getAccountInfo(vaultConfig);
  if (!info) throw new Error("vault_config not found");

  console.log(`data_len: ${info.data.length}`);
  console.log(`disc[0]: ${info.data[0]} (expected ${VAULT_CONFIG_DISCRIMINATOR[0]})`);

  if (info.data[0] !== VAULT_CONFIG_DISCRIMINATOR[0]) {
    throw new Error("discriminator mismatch");
  }

  const cfg = VaultConfigCodec.decode(info.data.subarray(1));
  console.log("\nVaultConfig:");
  console.log(`  authority:               ${cfg.authority.toBase58()}`);
  console.log(`  treasury:                ${cfg.treasury.toBase58()}`);
  console.log(`  fee_bps:                 ${cfg.feeBps}`);
  console.log(`  kamino_reserve:          ${cfg.kaminoReserve.toBase58()}`);
  console.log(`  usdc_mint:               ${cfg.usdcMint.toBase58()}`);
  console.log(`  ctoken_mint:             ${cfg.ctokenMint.toBase58()}`);
  console.log(`  oracle_pyth:             ${cfg.oraclePyth.toBase58()}`);
  console.log(`  oracle_switchboard_pri:  ${cfg.oracleSwitchboardPrice.toBase58()}`);
  console.log(`  oracle_switchboard_twap: ${cfg.oracleSwitchboardTwap.toBase58()}`);
  console.log(`  oracle_scope_config:     ${cfg.oracleScopeConfig.toBase58()}`);
  console.log(`  total_shares:            ${cfg.totalShares}`);
  console.log(`  last_known_total_assets: ${cfg.lastKnownTotalAssets}`);
  console.log(`  period_end_ts:           ${cfg.periodEndTs} (${new Date(Number(cfg.periodEndTs) * 1000).toISOString()})`);
  console.log(`  current_period_id:       ${cfg.currentPeriodId}`);
  console.log(`  is_paused:               ${cfg.isPaused}`);
  console.log(`  bump:                    ${cfg.bump}`);

  // Invariants that must hold on a live (non-fresh) vault.
  const errors: string[] = [];
  if (cfg.feeBps !== 1000) errors.push(`fee_bps expected 1000 (10%), got ${cfg.feeBps}`);
  if (cfg.isPaused) errors.push("is_paused expected false (vault should never be paused on devnet)");
  if (cfg.bump === 0) errors.push("bump expected non-zero (PDA derivation never yields bump=0 in practice)");
  // total_shares and last_known_total_assets are non-zero on a vault with active families — informational only.
  // current_period_id increments on roll_period — informational only.

  if (errors.length === 0) {
    console.log("\n✅ All initial values match expectations.");
  } else {
    console.log("\n❌ Mismatches:");
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
