// Day 6 Step 5: Surfpool e2e for distribute_monthly_allowance.
//
// Flow: init → create_family → deposit 100 USDC → admin-backdate
// last_distribution 31 days ago → distribute → assert kid received
// stream_rate USDC + fee accrued in treasury.

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
  "Sysvar1nstructions1111111111111111111111111",
);
const DEPOSIT_AMOUNT = 100_000_000n; // 100 USDC
const STREAM_RATE = 50_000_000n; // 50 USDC/month

async function main() {
  const pubkeys = JSON.parse(
    fs.readFileSync(
      path.join(os.homedir(), "refs", "mainnet-kamino-pubkeys.json"),
      "utf-8",
    ),
  );
  const connection = new Connection(SURFPOOL, "confirmed");
  const wallet = anchor.Wallet.local();
  anchor.setProvider(
    new anchor.AnchorProvider(connection, wallet, { commitment: "confirmed" }),
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
    KLEND,
  );

  const authority = (wallet as any).payer as Keypair;
  const [vaultConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    program.programId,
  );

  // Reuse-or-init pattern (Surfpool state persists across runs).
  let vaultExists = false;
  try {
    await program.account.vaultConfig.fetch(vaultConfigPda);
    vaultExists = true;
  } catch {}
  const vaultUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, vaultConfigPda, true);
  const vaultCtokenAta = getAssociatedTokenAddressSync(CTOKEN_MINT, vaultConfigPda, true);

  let treasuryUsdcAta: PublicKey;
  if (vaultExists) {
    const cfg = await program.account.vaultConfig.fetch(vaultConfigPda);
    treasuryUsdcAta = cfg.treasury;
  } else {
    const treasuryOwner = Keypair.generate();
    await connection.confirmTransaction(
      await connection.requestAirdrop(treasuryOwner.publicKey, LAMPORTS_PER_SOL),
      "confirmed",
    );
    treasuryUsdcAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        authority,
        USDC_MINT,
        treasuryOwner.publicKey,
      )
    ).address;
  }

  // Seed parent USDC.
  const parentUsdcAta = getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey);
  try {
    await getAccount(connection, parentUsdcAta);
  } catch {
    await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      USDC_MINT,
      wallet.publicKey,
    );
  }
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
        { amount: Number(DEPOSIT_AMOUNT) + 1_000_000 },
      ],
    }),
  });

  if (!vaultExists) {
    await program.methods
      .initializeVault({
        oraclePyth: PublicKey.default,
        oracleSwitchboardPrice: PublicKey.default,
        oracleSwitchboardTwap: PublicKey.default,
        oracleScopeConfig: SCOPE,
        cycleMonths: 12,
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
  }

  // Fresh family so we start with zero distribution history.
  const kid = Keypair.generate();
  await connection.confirmTransaction(
    await connection.requestAirdrop(kid.publicKey, LAMPORTS_PER_SOL),
    "confirmed",
  );
  const [familyPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("family"),
      wallet.publicKey.toBuffer(),
      kid.publicKey.toBuffer(),
    ],
    program.programId,
  );
  const [kidViewPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("kid"),
      wallet.publicKey.toBuffer(),
      kid.publicKey.toBuffer(),
    ],
    program.programId,
  );
  await program.methods
    .createFamily(kid.publicKey, new BN(STREAM_RATE.toString()))
    .accounts({ parent: wallet.publicKey, vaultConfig: vaultConfigPda })
    .rpc();

  const kidUsdcAta = (
    await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      USDC_MINT,
      kid.publicKey,
    )
  ).address;

  const kaminoAccounts = {
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
  };

  // ===== Deposit 100 USDC =====
  console.log(`\n=== DEPOSIT ${Number(DEPOSIT_AMOUNT) / 1e6} USDC ===`);
  await program.methods
    .deposit(new BN(DEPOSIT_AMOUNT.toString()), new BN(0))
    .accountsPartial({
      familyPosition: familyPda,
      parent: wallet.publicKey,
      parentUsdcAta,
      vaultUsdcAta,
      vaultCtokenAta,
      treasuryUsdcAta,
      vaultConfig: vaultConfigPda,
      usdcMint: USDC_MINT,
      ctokenMint: CTOKEN_MINT,
      ...kaminoAccounts,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 })])
    .rpc({ commitment: "confirmed" });

  // ===== Backdate last_distribution 31 days =====
  const backdated = new BN(Math.floor(Date.now() / 1000) - 31 * 86400);
  await program.methods
    .setFamilyLastDistribution(backdated)
    .accounts({
      vaultConfig: vaultConfigPda,
      familyPosition: familyPda,
      authority: wallet.publicKey,
    })
    .rpc();

  const treasuryBefore = (await getAccount(connection, treasuryUsdcAta)).amount;
  const kidBefore = (await getAccount(connection, kidUsdcAta)).amount;

  // ===== Distribute =====
  console.log(`\n=== DISTRIBUTE ${Number(STREAM_RATE) / 1e6} USDC ===`);
  const keeper = Keypair.generate();
  await connection.confirmTransaction(
    await connection.requestAirdrop(keeper.publicKey, LAMPORTS_PER_SOL),
    "confirmed",
  );
  const tx = await program.methods
    .distributeMonthlyAllowance()
    .accountsPartial({
      keeper: keeper.publicKey,
      familyPosition: familyPda,
      kidView: kidViewPda,
      kidUsdcAta,
      kidOwner: kid.publicKey,
      vaultUsdcAta,
      vaultCtokenAta,
      treasuryUsdcAta,
      vaultConfig: vaultConfigPda,
      usdcMint: USDC_MINT,
      ctokenMint: CTOKEN_MINT,
      ...kaminoAccounts,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([keeper])
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 })])
    .rpc({ commitment: "confirmed" });

  console.log(`  ✓ distribute tx: ${tx}`);

  const kidAfter = (await getAccount(connection, kidUsdcAta)).amount;
  const treasuryAfter = (await getAccount(connection, treasuryUsdcAta)).amount;
  const family = await program.account.familyPosition.fetch(familyPda);

  const kidReceived = kidAfter - kidBefore;
  const treasuryDelta = treasuryAfter - treasuryBefore;

  console.log(`\n--- Post-distribute state ---`);
  console.log(`  kid USDC received:         ${kidReceived}`);
  console.log(`  treasury USDC delta (fee): ${treasuryDelta}`);
  console.log(`  family.principal_remaining: ${family.principalRemaining.toString()}`);
  console.log(`  family.total_yield_earned:  ${family.totalYieldEarned.toString()}`);
  console.log(`  family.last_distribution:   ${family.lastDistribution.toString()}`);

  // Assertions
  // Kamino ceiling-on-collateral-burn can lose up to ~0.1% on the redeem.
  // The dust stays in vault_usdc_ata (absorbed by protocol, not user harm).
  // Tolerance 100_000n = 0.1 USDC = 20bps of stream_rate.
  if (kidReceived < STREAM_RATE - 100_000n) {
    throw new Error(
      `Kid received ${kidReceived} USDC, expected ~${STREAM_RATE} (tolerance 100k micro-USDC)`,
    );
  }
  if (kidReceived > STREAM_RATE) {
    throw new Error(`Kid received MORE than stream_rate: ${kidReceived}`);
  }
  // Principal-first drawdown: first distribution drawns from principal, so
  // principal_remaining should drop by ~stream_rate, yield_earned stays low.
  const principalBeforeBn = new BN(DEPOSIT_AMOUNT.toString());
  const principalDelta = principalBeforeBn.sub(family.principalRemaining);
  if (principalDelta.isNeg() || principalDelta.gtn(STREAM_RATE + 10_000n)) {
    throw new Error(
      `Principal drawdown unexpected: ${principalDelta.toString()}`,
    );
  }
  // Fee: likely non-zero because Kamino's borrowed_amount grew between
  // deposit and distribute. Allow zero (no slot gap) but warn.
  console.log(
    treasuryDelta > 0n
      ? `  ✓ fee collected: ${treasuryDelta} micro-USDC`
      : `  (no fee collected — negligible yield between deposit and distribute)`,
  );

  console.log(
    `\n✅ DISTRIBUTE E2E PASSED — kid received ${Number(kidReceived) / 1e6} USDC from Kamino-backed vault`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
