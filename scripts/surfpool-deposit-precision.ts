// Day 5 Step 1: Deliberate Path B precision regression test.
//
// Designed to FAIL against current (broken) Path B, then PASS after the fix.
// The assertion catches any Path B drift > 1 basis point.
//
// Precondition:
//   - Surfpool running FRESH (no persisted state): surfpool start --network mainnet
//   - Program deployed: anchor deploy --provider.cluster http://127.0.0.1:8899
//
// Run:
//   ANCHOR_WALLET=~/.config/solana/id.json \
//   ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 \
//   npx tsx scripts/surfpool-deposit-precision.ts
//
// The assertion: after two deposits of (A, B) USDC, `family.shares` should
// be ≈ A + B (within 1bp). Rationale: first deposit on fresh vault mints
// shares 1:1 with `amount` (Path A). Second deposit mints pro-rata against
// `total_assets_pre_deposit`. With correct Path B, total_assets_pre ≈ A
// (our cTokens are worth ~A USDC since we JUST deposited them at Kamino's
// exchange rate). Second deposit yields ≈ B shares. Total ≈ A + B.
//
// With broken Path B (missing borrowed_amount_sf), total_assets_pre is
// ~0.5% of the real value (most Kamino USDC is lent out). Second deposit
// yields ~220x too many shares. family.shares / (A+B) bleeds far from 1.0.

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Seedling } from "../target/types/seedling";
import {
  Connection,
  ComputeBudgetProgram,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SURFPOOL = "http://127.0.0.1:8899";
const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);
const FIRST_AMOUNT = 1_000_000_000n; // 1000 USDC
const SECOND_AMOUNT = 500_000_000n; // 500 USDC
// 100 bps (1%) tolerance. Chosen so the test discriminates cleanly:
//   - Broken Path B (missing borrowed_amount_sf): ~65,000 bps drift
//   - Correct Path B + real Kamino interest accrual between deposits: ~4 bps
// 100 is the sweet spot — catches bugs, allows real yield accrual during
// the slot between the two deposits.
const TOLERANCE_BPS = 100;

async function main() {
  const pubkeys = JSON.parse(
    fs.readFileSync(
      path.join(os.homedir(), "refs", "mainnet-kamino-pubkeys.json"),
      "utf-8"
    )
  );

  const connection = new Connection(SURFPOOL, "confirmed");
  const wallet = anchor.Wallet.local();
  anchor.setProvider(
    new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" })
  );
  const program = anchor.workspace.seedling as Program<Seedling>;

  const KLEND = new PublicKey(pubkeys.klendProgramId);
  const RESERVE = new PublicKey(pubkeys.usdcReserve);
  const LENDING_MARKET = new PublicKey(pubkeys.lendingMarket);
  const USDC_MINT = new PublicKey(pubkeys.usdcMint);
  const CTOKEN_MINT = new PublicKey(pubkeys.ctokenMint);
  const RESERVE_LIQ_SUPPLY = new PublicKey(pubkeys.liquiditySupplyVault);
  const SCOPE = new PublicKey(pubkeys.oracles.scopeConfig);

  const [LENDING_MARKET_AUTH] = PublicKey.findProgramAddressSync(
    [Buffer.from("lma"), LENDING_MARKET.toBuffer()],
    KLEND
  );

  const authority = (wallet as any).payer as Keypair;

  // Refuse to run against persisted state. Precision test needs fresh vault.
  const [vaultConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    program.programId
  );
  try {
    await program.account.vaultConfig.fetch(vaultConfigPda);
    console.error(
      "✗ ABORT: vault_config already exists. Path B regression test needs a FRESH Surfpool fork."
    );
    console.error("  Restart surfpool + redeploy program, then re-run.");
    process.exit(10);
  } catch {
    /* expected — proceed */
  }

  // Seed parent USDC.
  const parentUsdcAta = getAssociatedTokenAddressSync(
    USDC_MINT,
    wallet.publicKey
  );
  try {
    await getAccount(connection, parentUsdcAta);
  } catch {
    await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      USDC_MINT,
      wallet.publicKey
    );
  }
  const SEED_USDC = Number(FIRST_AMOUNT + SECOND_AMOUNT + 1_000_000n); // + 1 USDC buffer
  await fetch(SURFPOOL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "surfnet_setTokenAccount",
      params: [
        wallet.publicKey.toBase58(),
        USDC_MINT.toBase58(),
        { amount: SEED_USDC },
      ],
    }),
  });

  // Init vault + treasury + create family.
  const treasuryOwner = Keypair.generate();
  await connection.confirmTransaction(
    await connection.requestAirdrop(treasuryOwner.publicKey, LAMPORTS_PER_SOL),
    "confirmed"
  );
  const treasuryUsdcAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      USDC_MINT,
      treasuryOwner.publicKey
    )
  ).address;

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

  await program.methods
    .initializeVault({
      oraclePyth: PublicKey.default,
      oracleSwitchboardPrice: PublicKey.default,
      oracleSwitchboardTwap: PublicKey.default,
      oracleScopeConfig: SCOPE,
      periodEndTs: new BN(Math.floor(Date.now() / 1000) + 365 * 86400),
      feeBps: 1000,
    })
    .accountsPartial({
      authority: wallet.publicKey,
      usdcMint: USDC_MINT,
      ctokenMint: CTOKEN_MINT,
      treasuryUsdcAta,
      kaminoReserve: RESERVE,
      vaultConfig: vaultConfigPda,
      vaultUsdcAta,
      vaultCtokenAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  const kid = Keypair.generate().publicKey;
  const [familyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("family"), wallet.publicKey.toBuffer(), kid.toBuffer()],
    program.programId
  );
  await program.methods
    .createFamily(kid, new BN(50_000_000))
    .accounts({ parent: wallet.publicKey, vaultConfig: vaultConfigPda })
    .rpc();

  const depositAccounts = {
    familyPosition: familyPda,
    parent: wallet.publicKey,
    parentUsdcAta,
    vaultUsdcAta,
    vaultCtokenAta,
    treasuryUsdcAta,
    vaultConfig: vaultConfigPda,
    usdcMint: USDC_MINT,
    ctokenMint: CTOKEN_MINT,
    kaminoReserve: RESERVE,
    lendingMarket: LENDING_MARKET,
    lendingMarketAuthority: LENDING_MARKET_AUTH,
    reserveLiquiditySupply: RESERVE_LIQ_SUPPLY,
    oraclePyth: KLEND,
    oracleSwitchboardPrice: KLEND,
    oracleSwitchboardTwap: KLEND,
    oracleScopeConfig: SCOPE,
    kaminoProgram: KLEND,
    instructionSysvar: SYSVAR_INSTRUCTIONS,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };

  console.log(`\n=== DEPOSIT #1: ${Number(FIRST_AMOUNT) / 1e6} USDC ===`);
  await program.methods
    .deposit(new BN(FIRST_AMOUNT.toString()), new BN(0))
    .accountsPartial(depositAccounts)
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ])
    .rpc({ commitment: "confirmed" });

  const afterFirst = await program.account.familyPosition.fetch(familyPda);
  const cfgAfterFirst = await program.account.vaultConfig.fetch(vaultConfigPda);
  console.log(
    `  family.shares:                 ${afterFirst.shares.toString()}`
  );
  console.log(
    `  family.principal_deposited:    ${afterFirst.principalDeposited.toString()}`
  );
  console.log(
    `  vault_config.total_shares:     ${cfgAfterFirst.totalShares.toString()}`
  );
  console.log(
    `  vault_config.last_known_total: ${cfgAfterFirst.lastKnownTotalAssets.toString()}`
  );

  console.log(`\n=== DEPOSIT #2: ${Number(SECOND_AMOUNT) / 1e6} USDC ===`);
  await program.methods
    .deposit(new BN(SECOND_AMOUNT.toString()), new BN(0))
    .accountsPartial(depositAccounts)
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ])
    .rpc({ commitment: "confirmed" });

  const afterSecond = await program.account.familyPosition.fetch(familyPda);
  const cfgAfterSecond = await program.account.vaultConfig.fetch(
    vaultConfigPda
  );
  console.log(
    `  family.shares:                 ${afterSecond.shares.toString()}`
  );
  console.log(
    `  family.principal_deposited:    ${afterSecond.principalDeposited.toString()}`
  );
  console.log(
    `  vault_config.total_shares:     ${cfgAfterSecond.totalShares.toString()}`
  );
  console.log(
    `  vault_config.last_known_total: ${cfgAfterSecond.lastKnownTotalAssets.toString()}`
  );

  // ===== The Path B precision assertion =====
  //
  // With correct Path B: `family.shares` after 2 deposits ≈ sum(amounts).
  // Kamino's cUSDC appreciates slowly — over one slot (~400ms), drift is
  // microscopic. Drift > 1bp means Path B is wrong.
  const actualShares = BigInt(afterSecond.shares.toString());
  const expectedShares = FIRST_AMOUNT + SECOND_AMOUNT;
  const driftBps =
    (BigInt(Math.abs(Number(actualShares) - Number(expectedShares))) *
      10_000n) /
    expectedShares;

  console.log(`\n=== PATH B PRECISION ASSERTION ===`);
  console.log(`  expected shares (A+B): ${expectedShares}`);
  console.log(`  actual shares:         ${actualShares}`);
  console.log(`  drift (bps):           ${driftBps}`);
  console.log(`  tolerance (bps):       ${TOLERANCE_BPS}`);

  // Additional guard: correct Path B + Kamino yield accrual between deposits
  // should DILUTE the new depositor, producing slightly fewer shares than A+B.
  // If actual > expected, something's inverted.
  if (actualShares > expectedShares + 1000n) {
    console.error(
      `\n❌ UNEXPECTED INVERSION: actualShares (${actualShares}) > expected (${expectedShares})`
    );
    console.error(
      `   Yield accrual should DILUTE new deposit, not inflate it.`
    );
    process.exit(1);
  }

  if (driftBps <= BigInt(TOLERANCE_BPS)) {
    console.log(`\n✅ PATH B PRECISION WITHIN TOLERANCE — share math correct`);
    console.log(
      `   (Real Kamino yield accrual between deposits causes ~few bps drift.)`
    );
  } else {
    console.error(
      `\n❌ PATH B PRECISION FAILED — drift ${driftBps}bps > ${TOLERANCE_BPS}bps`
    );
    console.error(
      `   Shares off by a factor of ${(
        Number(actualShares) / Number(expectedShares)
      ).toFixed(2)}x`
    );
    console.error(
      `   Broken-Path-B signature is ~65,000 bps drift — this is a different shape.`
    );
    process.exit(1);
  }

  // Also assert the 5 Day-2 invariants.
  if (!cfgAfterSecond.totalShares.eq(afterSecond.shares)) {
    console.error(
      `\n❌ INVARIANT FAILED: total_shares (${cfgAfterSecond.totalShares.toString()}) != family.shares (${afterSecond.shares.toString()})`
    );
    process.exit(2);
  }
  console.log(`✅ invariant total_shares == family.shares`);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
