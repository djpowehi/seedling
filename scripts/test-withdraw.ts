// End-to-end test: withdraw shares from the Quasar vault on devnet.
// Validates the Kamino redeem_reserve_collateral CPI + PDA-signed transfer
// + share burning + principal/yield accounting.
//
// PREREQS:
//   1. test-deposit.ts has run successfully — vault holds USDC for the family
//
// Run:
//   FAMILY_KID=<kid> SHARES=<u64> npx tsx scripts/test-withdraw.ts

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
    console.error("Set FAMILY_KID=<kid pubkey>");
    process.exit(1);
  }
  const kid = new PublicKey(kidArg);
  const sharesToBurn = BigInt(process.env.SHARES ?? "500000"); // default half

  const [vaultConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    programId
  );
  const [familyPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from("family"), wallet.publicKey.toBuffer(), kid.toBuffer()],
    programId
  );
  const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("lma"), KAMINO_MARKET.toBuffer()],
    KLEND_PROGRAM
  );

  const parentUsdcAta = await getAssociatedTokenAddress(
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
  const TREASURY_OWNER = process.env.TREASURY_OWNER
    ? new PublicKey(process.env.TREASURY_OWNER)
    : new PublicKey("6dkYhc2QN1NjhhUjMr5zJnYXTovYFiaHvfd2Tq3w1EGB");
  const treasuryUsdcAta = await getAssociatedTokenAddress(
    USDC_MINT,
    TREASURY_OWNER,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  // Pre-state for diff
  const fpInfoBefore = await connection.getAccountInfo(familyPosition);
  if (!fpInfoBefore) throw new Error("family_position not found");
  const fpBefore = FamilyPositionCodec.decode(fpInfoBefore.data.subarray(1));
  console.log("Wallet:        ", wallet.publicKey.toBase58());
  console.log("Kid:           ", kid.toBase58());
  console.log(`Shares to burn: ${sharesToBurn}`);
  console.log(`\nFamilyPosition (pre-withdraw):`);
  console.log(`  shares:                ${fpBefore.shares}`);
  console.log(`  principal_remaining:   ${fpBefore.principalRemaining}`);
  console.log(`  total_yield_earned:    ${fpBefore.totalYieldEarned}`);

  const usdcInfoBefore = await connection.getTokenAccountBalance(parentUsdcAta);
  console.log(`Parent USDC (pre):       ${usdcInfoBefore.value.amount}`);

  if (BigInt(fpBefore.shares) < sharesToBurn) {
    console.error(
      `❌ Family has ${fpBefore.shares} shares, can't burn ${sharesToBurn}`
    );
    process.exit(1);
  }

  const ix = client.createWithdrawInstruction({
    familyPosition,
    parent: wallet.publicKey,
    parentUsdcAta,
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
    sharesToBurn,
    minAssetsOut: BigInt(0),
  });

  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 });

  const tx = new Transaction().add(cuIx).add(ix);
  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(wallet);

  console.log("\nSimulating withdraw...");
  const sim = await connection.simulateTransaction(tx);
  if (sim.value.err) {
    sim.value.logs?.forEach((l) => console.log(`  ${l}`));
    console.error("\n❌ Simulation failed:", JSON.stringify(sim.value.err));
    process.exit(1);
  }
  console.log(
    `✅ Simulation succeeded. CU consumed: ${sim.value.unitsConsumed}`
  );

  console.log("\nSending withdraw...");
  const sig = await connection.sendRawTransaction(tx.serialize());
  console.log(`tx: ${sig}`);
  console.log(
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`
  );
  await connection.confirmTransaction(sig, "confirmed");
  console.log("✅ confirmed");

  // Post-state
  const fpInfoAfter = await connection.getAccountInfo(familyPosition);
  if (!fpInfoAfter) throw new Error("family_position vanished");
  const fpAfter = FamilyPositionCodec.decode(fpInfoAfter.data.subarray(1));
  const usdcInfoAfter = await connection.getTokenAccountBalance(parentUsdcAta);

  const vcInfo = await connection.getAccountInfo(vaultConfig);
  if (!vcInfo) throw new Error("vault_config vanished");
  const vc = VaultConfigCodec.decode(vcInfo.data.subarray(1));

  console.log(`\nFamilyPosition (post-withdraw):`);
  console.log(`  shares:                ${fpAfter.shares}`);
  console.log(`  principal_remaining:   ${fpAfter.principalRemaining}`);
  console.log(`  total_yield_earned:    ${fpAfter.totalYieldEarned}`);

  const sharesDelta = BigInt(fpBefore.shares) - BigInt(fpAfter.shares);
  const usdcDelta = BigInt(usdcInfoAfter.value.amount) - BigInt(usdcInfoBefore.value.amount);
  console.log(`\nDeltas:`);
  console.log(`  shares burned:    ${sharesDelta} (expected ${sharesToBurn})`);
  console.log(`  USDC received:    ${usdcDelta}`);
  console.log(`  vault.total_shares: ${vc.totalShares}`);

  const errors: string[] = [];
  if (sharesDelta !== sharesToBurn)
    errors.push(`shares burned mismatch: ${sharesDelta} vs ${sharesToBurn}`);
  if (usdcDelta <= 0n) errors.push("USDC delta should be > 0");
  if (BigInt(vc.totalShares) !== BigInt(fpAfter.shares))
    errors.push(
      `invariant: vault.total_shares (${vc.totalShares}) != family.shares (${fpAfter.shares})`
    );

  if (errors.length === 0) {
    console.log(
      "\n✅ Withdraw + Kamino redeem CPI succeeded. Invariants hold."
    );
  } else {
    console.log("\n❌ Errors:");
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
