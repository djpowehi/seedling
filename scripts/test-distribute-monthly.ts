// End-to-end test for distribute_monthly_allowance.
//
// Self-contained: creates a fresh family with small stream rate, deposits,
// uses set_family_last_distribution to backdate the 30-day gate, then
// distributes. Validates the kid receives stream_rate USDC and accounting
// updates correctly.

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
} from "../frontend/lib/quasar-client";

const KEYPAIR_PATH = path.join(os.homedir(), ".config/solana/id.json");
const RPC = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
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

const STREAM_RATE = BigInt(100_000); // 0.1 USDC/mo so a 1 USDC deposit supports many months
const DEPOSIT_AMOUNT = BigInt(2_000_000); // 2 USDC

async function sendTx(
  connection: Connection,
  tx: Transaction,
  wallet: Keypair,
  label: string
): Promise<string> {
  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(wallet);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  console.log(`${label}: ${sig}`);
  return sig;
}

async function main() {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8")))
  );
  const connection = new Connection(RPC, "confirmed");
  const client = new SeedlingQuasarClient();
  const programId = SeedlingQuasarClient.programId;

  // Fresh kid pubkey for this test.
  const kidKeypair = Keypair.generate();
  const kid = kidKeypair.publicKey;

  console.log("Wallet:", wallet.publicKey.toBase58());
  console.log("Kid:   ", kid.toBase58());

  // PDAs
  const [vaultConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    programId
  );
  const [familyPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from("family"), wallet.publicKey.toBuffer(), kid.toBuffer()],
    programId
  );
  const [kidView] = PublicKey.findProgramAddressSync(
    [Buffer.from("kid"), wallet.publicKey.toBuffer(), kid.toBuffer()],
    programId
  );
  const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("lma"), KAMINO_MARKET.toBuffer()],
    KLEND_PROGRAM
  );

  // ATAs
  const parentUsdcAta = await getAssociatedTokenAddress(
    USDC_MINT,
    wallet.publicKey,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  const kidUsdcAta = await getAssociatedTokenAddress(
    USDC_MINT,
    kid,
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
  const TREASURY_OWNER = new PublicKey(
    "6dkYhc2QN1NjhhUjMr5zJnYXTovYFiaHvfd2Tq3w1EGB"
  );
  const treasuryUsdcAta = await getAssociatedTokenAddress(
    USDC_MINT,
    TREASURY_OWNER,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // ─── Step 1: create_family + create kid_usdc_ata ───
  console.log("\n[1/4] create_family + ensure kid_usdc_ata exists...");
  const createFamilyIx = client.createCreateFamilyInstruction({
    parent: wallet.publicKey,
    vaultConfig,
    familyPosition,
    kidView,
    systemProgram: SystemProgram.programId,
    kid,
    streamRate: STREAM_RATE,
  });
  const createKidAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    wallet.publicKey,
    kidUsdcAta,
    kid,
    USDC_MINT
  );
  await sendTx(
    connection,
    new Transaction().add(createKidAtaIx).add(createFamilyIx),
    wallet,
    "  create"
  );

  // ─── Step 2: deposit ───
  console.log("\n[2/4] deposit 2 USDC...");
  const depositIx = client.createDepositInstruction({
    familyPosition,
    depositor: wallet.publicKey,
    depositorUsdcAta: parentUsdcAta,
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
    oracleSwitchboardPrice: KLEND_PROGRAM,
    oracleSwitchboardTwap: KLEND_PROGRAM,
    oracleScopeConfig: KLEND_PROGRAM,
    kaminoProgram: KLEND_PROGRAM,
    instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
    amount: DEPOSIT_AMOUNT,
    minSharesOut: BigInt(0),
  });
  await sendTx(
    connection,
    new Transaction()
      .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }))
      .add(depositIx),
    wallet,
    "  deposit"
  );

  // ─── Step 3: backdate last_distribution by 31 days ───
  console.log("\n[3/4] backdate last_distribution by 31 days...");
  const backdated = BigInt(Math.floor(Date.now() / 1000) - 31 * 86_400);
  const backdateIx = client.createSetFamilyLastDistributionInstruction({
    vaultConfig,
    familyPosition,
    authority: wallet.publicKey,
    newLastDistribution: backdated,
  });
  await sendTx(
    connection,
    new Transaction().add(backdateIx),
    wallet,
    "  backdate"
  );

  // ─── Step 4: distribute_monthly_allowance ───
  console.log("\n[4/4] distribute_monthly_allowance...");
  const kidUsdcBefore = await connection.getTokenAccountBalance(kidUsdcAta);
  console.log(`  kid USDC pre:  ${kidUsdcBefore.value.amount}`);

  const distributeIx = client.createDistributeMonthlyAllowanceInstruction({
    keeper: wallet.publicKey,
    familyPosition,
    kidView,
    kidUsdcAta,
    kidOwner: kid,
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
    oracleSwitchboardPrice: KLEND_PROGRAM,
    oracleSwitchboardTwap: KLEND_PROGRAM,
    oracleScopeConfig: KLEND_PROGRAM,
    kaminoProgram: KLEND_PROGRAM,
    instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  });

  const tx = new Transaction()
    .add(ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }))
    .add(distributeIx);
  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(wallet);

  const sim = await connection.simulateTransaction(tx);
  if (sim.value.err) {
    sim.value.logs?.forEach((l) => console.log(`  ${l}`));
    console.error("\n❌ Simulation failed:", JSON.stringify(sim.value.err));
    process.exit(1);
  }
  console.log(
    `  ✅ Simulation succeeded. CU consumed: ${sim.value.unitsConsumed}`
  );

  const sig = await connection.sendRawTransaction(tx.serialize());
  console.log(`  tx: ${sig}`);
  console.log(
    `  https://explorer.solana.com/tx/${sig}?cluster=devnet`
  );
  await connection.confirmTransaction(sig, "confirmed");

  // Post-state
  const fpInfoAfter = await connection.getAccountInfo(familyPosition);
  if (!fpInfoAfter) throw new Error("family_position vanished");
  const fpAfter = FamilyPositionCodec.decode(fpInfoAfter.data.subarray(1));
  const kidUsdcAfter = await connection.getTokenAccountBalance(kidUsdcAta);

  const kidDelta =
    BigInt(kidUsdcAfter.value.amount) - BigInt(kidUsdcBefore.value.amount);

  console.log(`\nPost-distribute:`);
  console.log(`  kid USDC:               ${kidUsdcAfter.value.amount}`);
  console.log(`  kid received:           ${kidDelta} (expected ~${STREAM_RATE})`);
  console.log(`  family.principal_remaining: ${fpAfter.principalRemaining}`);
  console.log(`  family.last_distribution:   ${fpAfter.lastDistribution}`);
  console.log(`  family.total_yield_earned:  ${fpAfter.totalYieldEarned}`);

  const errors: string[] = [];
  if (kidDelta !== STREAM_RATE)
    errors.push(`kid received ${kidDelta}, expected ${STREAM_RATE}`);
  // Principal-first drawdown: stream_rate comes from principal first.
  // 2 USDC principal - 0.1 USDC stream = 1.9 USDC remaining.
  if (BigInt(fpAfter.principalRemaining) !== DEPOSIT_AMOUNT - STREAM_RATE)
    errors.push(
      `principal_remaining ${fpAfter.principalRemaining}, expected ${DEPOSIT_AMOUNT - STREAM_RATE}`
    );

  if (errors.length === 0) {
    console.log(
      "\n✅ distribute_monthly_allowance succeeded. Kid received stream_rate USDC, principal-first drawdown holds."
    );
  } else {
    console.log("\n❌ Errors:");
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }

  console.log("\n📋 For follow-up tests:");
  console.log(`  KID=${kid.toBase58()}`);
  console.log(`  FAMILY_POSITION=${familyPosition.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
