// End-to-end test: invoke deposit on the deployed Quasar program.
// Validates the Kamino CPI path (refresh_reserve + deposit_reserve_liquidity)
// + Path-B exchange-rate math + share minting.
//
// PREREQS:
//   1. initialize_vault has been run (scripts/initialize-quasar-vault.ts)
//   2. create_family has been run for the FAMILY_KID env var below
//   3. Wallet has at least 1 USDC of devnet Circle USDC
//      (faucet: https://faucet.circle.com/ → Solana Devnet)
//
// Run:
//   FAMILY_KID=<kid pubkey> AMOUNT=1000000 npx tsx scripts/test-deposit.ts

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import {
  SeedlingQuasarClient,
  FamilyPositionCodec,
  VaultConfigCodec,
  FAMILY_POSITION_DISCRIMINATOR,
  VAULT_CONFIG_DISCRIMINATOR,
} from "../frontend/lib/quasar-client";

const KEYPAIR_PATH = path.join(os.homedir(), ".config/solana/id.json");
const RPC = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";

// Devnet addresses
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
const CTOKEN_MINT = new PublicKey("6FY2rwh5wWrtSveAG9t9ANc2YsrChNasVSEpMQubJcXd");
const KAMINO_RESERVE = new PublicKey(
  "HRwMj8uuoGVWCanKzKvpTWN5ZvXjtjKGxcFbn2qTPKMW"
);
const KAMINO_MARKET = new PublicKey(
  "6aaNTBEmwdN19AAdTwbNrWyUo6iEyiLguxCTePEzSqoH"
);
const KLEND_PROGRAM = new PublicKey(
  "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD"
);
const RESERVE_LIQ_SUPPLY = new PublicKey(
  "6icVFmuKEsH5dzDwTSrxzrnJ14N27gDKRc2XAxPtB4ep"
);
const ORACLE_PYTH = new PublicKey(
  "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX"
);

async function main() {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8")))
  );
  const connection = new Connection(RPC, "confirmed");
  const client = new SeedlingQuasarClient();
  const programId = SeedlingQuasarClient.programId;

  const kidArg = process.env.FAMILY_KID;
  if (!kidArg) {
    console.error("Set FAMILY_KID=<kid pubkey> from a previous create_family run.");
    process.exit(1);
  }
  const kid = new PublicKey(kidArg);
  const amount = BigInt(process.env.AMOUNT ?? "1000000"); // default 1 USDC

  const [vaultConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    programId
  );
  const [familyPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from("family"), wallet.publicKey.toBuffer(), kid.toBuffer()],
    programId
  );

  // klend lending_market_authority PDA: ["lma", lending_market]
  const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("lma"), KAMINO_MARKET.toBuffer()],
    KLEND_PROGRAM
  );

  // ATAs
  const depositorUsdcAta = await getAssociatedTokenAddress(
    USDC_MINT,
    wallet.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
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
  // Treasury was set at init as the parent's USDC ATA (per init script).
  const treasuryUsdcAta = depositorUsdcAta;

  console.log("Wallet:           ", wallet.publicKey.toBase58());
  console.log("Kid:              ", kid.toBase58());
  console.log("FamilyPosition:   ", familyPosition.toBase58());
  console.log("Amount (raw u64): ", amount.toString(), `(${Number(amount)/1e6} USDC)`);
  console.log("");

  // Pre-flight: confirm USDC balance.
  const ataInfo = await connection.getTokenAccountBalance(depositorUsdcAta);
  const balanceRaw = BigInt(ataInfo.value.amount);
  console.log(`Current USDC balance: ${ataInfo.value.uiAmountString} (${balanceRaw} raw)`);
  if (balanceRaw < amount) {
    console.error(
      `\n❌ Need at least ${amount} raw USDC, have ${balanceRaw}.\n   Get devnet USDC from https://faucet.circle.com/`
    );
    process.exit(1);
  }

  const ix = client.createDepositInstruction({
    familyPosition,
    depositor: wallet.publicKey,
    depositorUsdcAta,
    vaultUsdcAta,
    vaultCtokenAta,
    treasuryUsdcAta,
    vaultConfig,
    usdcMint: USDC_MINT,
    ctokenMint: CTOKEN_MINT,
    kaminoReserve: KAMINO_RESERVE,
    lendingMarket: KAMINO_MARKET,
    lendingMarketAuthority,
    reserveLiquiditySupply: RESERVE_LIQ_SUPPLY,
    oraclePyth: ORACLE_PYTH,
    // Devnet USDC reserve uses pyth only — pass klend program ID as
    // sentinel for unused oracle slots.
    oracleSwitchboardPrice: KLEND_PROGRAM,
    oracleSwitchboardTwap: KLEND_PROGRAM,
    oracleScopeConfig: KLEND_PROGRAM,
    kaminoProgram: KLEND_PROGRAM,
    instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    amount,
    minSharesOut: BigInt(0),
  });

  // Bump compute budget — Kamino CPIs are heavy (~100k CU baseline).
  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 });

  const tx = new Transaction().add(cuIx).add(ix);
  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(wallet);

  console.log("\nSimulating deposit (logs will show the Kamino CPI flow)...");
  const sim = await connection.simulateTransaction(tx);
  if (sim.value.logs) {
    sim.value.logs.forEach((l) => console.log(`  ${l}`));
  }
  if (sim.value.err) {
    console.error("\n❌ Simulation failed:", JSON.stringify(sim.value.err));
    process.exit(1);
  }
  console.log(
    `\n✅ Simulation succeeded. CU consumed: ${sim.value.unitsConsumed}`
  );

  console.log("\nSending deposit...");
  const sig = await connection.sendRawTransaction(tx.serialize());
  console.log(`tx: ${sig}`);
  console.log(
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`
  );
  await connection.confirmTransaction(sig, "confirmed");
  console.log("✅ confirmed");

  // Verify post-state.
  console.log("\nReading family_position...");
  const fpInfo = await connection.getAccountInfo(familyPosition);
  if (!fpInfo || fpInfo.data[0] !== FAMILY_POSITION_DISCRIMINATOR[0]) {
    throw new Error("family_position bad");
  }
  const fp = FamilyPositionCodec.decode(fpInfo.data.subarray(1));
  console.log(`  shares:                ${fp.shares}`);
  console.log(`  principal_deposited:   ${fp.principalDeposited}`);
  console.log(`  principal_remaining:   ${fp.principalRemaining}`);

  const vcInfo = await connection.getAccountInfo(vaultConfig);
  if (!vcInfo || vcInfo.data[0] !== VAULT_CONFIG_DISCRIMINATOR[0]) {
    throw new Error("vault_config bad");
  }
  const vc = VaultConfigCodec.decode(vcInfo.data.subarray(1));
  console.log(`\nvault_config:`);
  console.log(`  total_shares:            ${vc.totalShares}`);
  console.log(`  last_known_total_assets: ${vc.lastKnownTotalAssets}`);

  if (fp.principalDeposited !== amount) {
    console.error(
      `❌ principal_deposited mismatch: expected ${amount}, got ${fp.principalDeposited}`
    );
    process.exit(1);
  }
  if (fp.shares === 0n) {
    console.error("❌ shares should be > 0");
    process.exit(1);
  }
  if (vc.totalShares !== fp.shares) {
    console.error(
      `❌ invariant broken: vault.total_shares (${vc.totalShares}) != family.shares (${fp.shares})`
    );
    process.exit(1);
  }
  console.log(
    "\n✅ Deposit + Kamino CPI succeeded. Invariant holds: vault.total_shares == family.shares"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
