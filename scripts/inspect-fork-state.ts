import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Seedling } from "../target/types/seedling";
import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  const pubkeys = JSON.parse(
    fs.readFileSync(
      path.join(os.homedir(), "refs", "mainnet-kamino-pubkeys.json"),
      "utf-8"
    )
  );
  const connection = new Connection("http://127.0.0.1:8899", "confirmed");
  const wallet = anchor.Wallet.local();
  anchor.setProvider(
    new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" })
  );
  const program = anchor.workspace.seedling as Program<Seedling>;

  const USDC_MINT = new PublicKey(pubkeys.usdcMint);
  const CTOKEN_MINT = new PublicKey(pubkeys.ctokenMint);
  const [vaultConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    program.programId
  );
  const vaultUsdcAta = getAssociatedTokenAddressSync(
    USDC_MINT,
    vaultConfigPda,
    true
  );
  const vaultCtokenAta = getAssociatedTokenAddressSync(
    CTOKEN_MINT,
    vaultConfigPda,
    true
  );
  const parentUsdcAta = getAssociatedTokenAddressSync(
    USDC_MINT,
    wallet.publicKey
  );

  const cfg = await program.account.vaultConfig.fetch(vaultConfigPda);
  console.log("\n--- VaultConfig ---");
  console.log(`  total_shares:             ${cfg.totalShares.toString()}`);
  console.log(
    `  last_known_total_assets:  ${cfg.lastKnownTotalAssets.toString()}`
  );

  const vu = await getAccount(connection, vaultUsdcAta);
  const vc = await getAccount(connection, vaultCtokenAta);
  const pu = await getAccount(connection, parentUsdcAta);
  console.log("\n--- Vault balances ---");
  console.log(`  vault_usdc_ata.amount:    ${vu.amount}`);
  console.log(`  vault_ctoken_ata.amount:  ${vc.amount}`);
  console.log(`  parent_usdc_ata.amount:   ${pu.amount}`);

  // Now compute what Path B would return with our fixed math
  const reserveInfo = await connection.getAccountInfo(
    new PublicKey(pubkeys.usdcReserve)
  );
  if (!reserveInfo) throw new Error("reserve not in fork");
  const reserveData = reserveInfo.data;
  const totalAvailable = reserveData.readBigUInt64LE(224);
  const borrowedSfLo = reserveData.readBigUInt64LE(232);
  const borrowedSfHi = reserveData.readBigUInt64LE(240);
  const borrowedSf = (borrowedSfHi << 64n) | borrowedSfLo;
  const borrowed = borrowedSf >> 60n;
  const kaminoTotalLiquidity = totalAvailable + borrowed;

  const ctokenMint = await connection.getAccountInfo(CTOKEN_MINT);
  const ctokenSupply = ctokenMint!.data.readBigUInt64LE(36); // mint.supply at offset 36

  console.log("\n--- Reserve-side state ---");
  console.log(`  total_available_amount:   ${totalAvailable}`);
  console.log(`  borrowed_amount_sf:       ${borrowedSf}`);
  console.log(`  borrowed_amount:          ${borrowed}`);
  console.log(`  kamino_total_liquidity:   ${kaminoTotalLiquidity}`);
  console.log(`  ctoken_supply:            ${ctokenSupply}`);
  console.log(
    `  ratio (liq/supply):       ${
      Number(kaminoTotalLiquidity) / Number(ctokenSupply)
    }`
  );

  const vaultCtokensHeld = vc.amount;
  const pathB = (vaultCtokensHeld * kaminoTotalLiquidity) / ctokenSupply;
  console.log(`\n--- Path B value for our cTokens ---`);
  console.log(`  vault_ctokens_held × kamino_liq / ctoken_supply = ${pathB}`);
  console.log(
    `  vault_config.last_known (from deposit #1):        ${cfg.lastKnownTotalAssets.toString()}`
  );
  console.log(
    `  yield delta:                                      ${
      pathB - BigInt(cfg.lastKnownTotalAssets.toString())
    }`
  );
  console.log(
    `  fee @ 10%:                                        ${
      (pathB - BigInt(cfg.lastKnownTotalAssets.toString())) / 10n
    }`
  );
}

main().catch(console.error);
