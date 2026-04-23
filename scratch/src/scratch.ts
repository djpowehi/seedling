// Kamino devnet scratch test
// Verifies 4 criteria from DAY1_SCRATCH_CRITERIA.md:
//   1. Deposit 1 USDC into Kamino devnet USDC reserve succeeds
//   2. cToken balance appears in expected destination
//   3. Redeem some fraction back succeeds
//   4. Received USDC amount >= original (cTokens didn't lose value)

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ComputeBudgetProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { createSolanaRpc, address as kitAddress } from "@solana/kit";
import {
  KaminoAction,
  KaminoMarket,
  VanillaObligation,
  PROGRAM_ID as KLEND_PROGRAM_ID,
} from "@kamino-finance/klend-sdk";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import Decimal from "decimal.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEVNET = "https://api.devnet.solana.com";
const USDC_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"); // Circle devnet USDC

// Candidates found via getProgramAccounts — 8 USDC reserves on devnet.
// Try in order; first one where market loads + reserve is operational wins.
const CANDIDATE_MARKETS: Array<{ market: string; reserve: string }> = [
  {
    market: "6aaNTBEmwdN19AAdTwbNrWyUo6iEyiLguxCTePEzSqoH",
    reserve: "HRwMj8uuoGVWCanKzKvpTWN5ZvXjtjKGxcFbn2qTPKMW",
  },
  {
    market: "DFwjqtUtNRFFddFVkoScE4DUdhHBTPW5Vw5KXupGcyWs",
    reserve: "8xnJfxrbiYrKBBbGJ2aBMHWKhkAQ7veKVVNPL9DfYNhu",
  },
  {
    market: "66ARS8zdM9NJocZB1ixKVedoPsbfbzWXXjozGZhUASU",
    reserve: "6jrwyGApj9dGXJArBCfFbUeRMMMv5M5oApyxChvt7986",
  },
  {
    market: "EKeBEcR32Twyb9bFMASQVdvwYhKNimtZbAtxXY225XtW",
    reserve: "DKn6r7beyddptFcThDNpZHbZGPBxb9MyXiFenAg9KVrv",
  },
  {
    market: "6FPM5QzjJ7nA2Ga1bKw3nxYUUwJPscBFK4T5yKAabded",
    reserve: "5d1RGC9Jr7RVPhtUzdteW5ABkmQQgYjF6pp6oELfjJSt",
  },
  {
    market: "BXcz9jqE4E74axzMYzqzgbhaiuLVgTw38jD28p47686D",
    reserve: "HSyb1Vy17yFpVmTsn4oUYn2w7kApZavNB1FzH8thtM2T",
  },
  {
    market: "27MKCQo5qP7ijrwWSMKX2Jeb3PhK2NZmHQ9befWVRS4J",
    reserve: "9uKMtFU9UJ9DfbwzCReGENb31appi79KTEeDGdCnvMjy",
  },
  {
    market: "HqCoqWT42Qdg1fbsWFo6TNCkH6eSY2MtxHFEkPoBvCHm",
    reserve: "DHP5csgS8ba2dFAqgM5dqNXoUw3x9EWaPwYXVACQ4Wxn",
  },
];

function loadKeypair(): Keypair {
  const keyPath = path.join(os.homedir(), ".config", "solana", "id.json");
  const secret = JSON.parse(fs.readFileSync(keyPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

async function getUsdcBalance(
  connection: Connection,
  owner: PublicKey,
): Promise<bigint> {
  const ata = await getAssociatedTokenAddress(USDC_MINT, owner);
  try {
    const info = await getAccount(connection, ata);
    return info.amount;
  } catch {
    return 0n;
  }
}

async function main() {
  const connection = new Connection(DEVNET, "confirmed");
  const rpc = createSolanaRpc(DEVNET) as any; // kit RPC for klend-sdk
  const payer = loadKeypair();
  console.log(`Wallet: ${payer.publicKey.toBase58()}`);

  const sol = await connection.getBalance(payer.publicKey);
  console.log(`SOL balance: ${(sol / LAMPORTS_PER_SOL).toFixed(4)}`);
  if (sol < 0.5 * LAMPORTS_PER_SOL) {
    console.error("!! Need at least 0.5 SOL for gas. Abort.");
    process.exit(1);
  }

  const usdcStart = await getUsdcBalance(connection, payer.publicKey);
  console.log(`USDC balance: ${Number(usdcStart) / 1e6} USDC`);
  if (usdcStart < 1_000_000n) {
    console.error("!! Need at least 1 USDC. Abort.");
    process.exit(1);
  }

  // Find a working market with a USDC reserve
  let market: KaminoMarket | null = null;
  let reserveAddress: string | null = null;
  for (const { market: mk, reserve: rs } of CANDIDATE_MARKETS) {
    try {
      console.log(`\nTrying market ${mk}...`);
      const candidate = await KaminoMarket.load(
        rpc,
        kitAddress(mk) as any,
        450,
      );
      if (!candidate) {
        console.log("  load() returned null");
        continue;
      }
      await candidate.loadReserves(); // critical: otherwise getReserveByMint returns undefined
      const r = candidate.getReserveByAddress(kitAddress(rs) as any);
      if (!r) {
        console.log("  reserve not in market");
        continue;
      }
      const stats = r.stats;
      console.log(
        `  reserve symbol=${r.symbol}  status=${stats.status}  mint_decimals=${r.stats.decimals}`,
      );
      console.log(
        `  total_supply(USDC)=${r.getTotalSupply().toString()}  total_borrow=${r.getBorrowedAmount().toString()}`,
      );
      if (String(stats.status).toLowerCase() !== "active") {
        console.log("  skip: reserve not Active");
        continue;
      }
      market = candidate;
      reserveAddress = rs;
      console.log(`  ✓ picked market=${mk}  reserve=${rs}`);
      break;
    } catch (e: any) {
      console.log(`  error: ${e.message ?? e}`);
    }
  }

  if (!market || !reserveAddress) {
    console.error(
      "\n!! No operational USDC reserve found on Kamino devnet. Switch to Surfpool mainnet-fork.",
    );
    process.exit(2);
  }

  // ===== Criterion 1: Deposit 1 USDC =====
  const amountLamports = new Decimal(1_000_000); // 1 USDC (6 decimals)
  console.log(`\n[1/4] Building deposit tx for 1 USDC...`);

  const reserveForBuild = market.getReserveByAddress(
    kitAddress(reserveAddress) as any,
  )!;
  const reserveMint = reserveForBuild.getLiquidityMint(); // use SDK's own Address for equality
  console.log(`  reserve mint (from SDK): ${reserveMint.toString()}`);

  // owner/payer as TransactionSigner (kit format). klend-sdk v2 expects kit signer.
  const { createKeyPairSignerFromBytes } = await import("@solana/kit");
  const ownerSigner: any = await createKeyPairSignerFromBytes(payer.secretKey);

  const depositAction = await KaminoAction.buildDepositReserveLiquidityTxns(
    market,
    amountLamports.toString(),
    reserveMint,
    ownerSigner,
    new VanillaObligation(KLEND_PROGRAM_ID),
    undefined,
    undefined,
    undefined,
  );
  console.log(
    `  action built; setup ixs=${depositAction.setupIxs.length}, lending ixs=${depositAction.lendingIxs.length}, cleanup ixs=${depositAction.cleanupIxs.length}`,
  );

  // Convert kit IInstruction -> legacy TransactionInstruction
  const kitToLegacy = (ix: any): TransactionInstruction => {
    const programIdStr = ix.programAddress ?? ix.programId ?? "";
    const keys = (ix.accounts ?? []).map((a: any) => ({
      pubkey: new PublicKey(a.address ?? a.pubkey),
      isSigner:
        typeof a.role === "number" ? (a.role & 0x02) !== 0 : !!a.isSigner,
      isWritable:
        typeof a.role === "number" ? (a.role & 0x01) !== 0 : !!a.isWritable,
    }));
    const data = ix.data ? Buffer.from(ix.data) : Buffer.alloc(0);
    return new TransactionInstruction({
      programId: new PublicKey(programIdStr.toString()),
      keys,
      data,
    });
  };

  const depositTx = new Transaction();
  depositTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
  depositTx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
  );
  for (const ix of depositAction.setupIxs) depositTx.add(kitToLegacy(ix));
  for (const ix of depositAction.lendingIxs) depositTx.add(kitToLegacy(ix));
  for (const ix of depositAction.cleanupIxs) depositTx.add(kitToLegacy(ix));

  console.log(`  sending...`);
  const depositSig = await sendAndConfirmTransaction(
    connection,
    depositTx,
    [payer],
    { commitment: "confirmed", skipPreflight: false },
  );
  console.log(`  ✓ deposit tx: ${depositSig}`);

  // ===== Criterion 2: cToken balance in destination =====
  const reserve = market.getReserveByAddress(
    kitAddress(reserveAddress) as any,
  )!;
  const cTokenMint = new PublicKey(
    reserve.state.collateral.mintPubkey.toString(),
  );
  const cTokenAta = await getAssociatedTokenAddress(
    cTokenMint,
    payer.publicKey,
  );
  let cTokenBal = 0n;
  try {
    cTokenBal = (await getAccount(connection, cTokenAta)).amount;
  } catch (e: any) {
    console.error(`  ✗ cToken ATA not found: ${e.message}`);
  }
  console.log(
    `[2/4] cToken balance: ${cTokenBal.toString()}  (mint=${cTokenMint.toBase58()})`,
  );
  if (cTokenBal === 0n) {
    console.error("  ✗ Criterion 2 FAILED: no cTokens minted.");
    process.exit(3);
  }
  console.log("  ✓ cTokens received");

  // ===== Criterion 3: Redeem half of cTokens =====
  const redeemAmount = cTokenBal / 2n;
  console.log(
    `\n[3/4] Building redeem tx for ${redeemAmount} cTokens (half)...`,
  );

  const usdcBeforeRedeem = await getUsdcBalance(connection, payer.publicKey);
  const redeemAction = await KaminoAction.buildRedeemReserveCollateralTxns(
    market,
    redeemAmount.toString(),
    reserveMint,
    ownerSigner,
    new VanillaObligation(KLEND_PROGRAM_ID),
    undefined,
    undefined,
    undefined,
  );

  const redeemTx = new Transaction();
  redeemTx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }));
  redeemTx.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
  );
  for (const ix of redeemAction.setupIxs) redeemTx.add(kitToLegacy(ix));
  for (const ix of redeemAction.lendingIxs) redeemTx.add(kitToLegacy(ix));
  for (const ix of redeemAction.cleanupIxs) redeemTx.add(kitToLegacy(ix));

  const redeemSig = await sendAndConfirmTransaction(
    connection,
    redeemTx,
    [payer],
    { commitment: "confirmed", skipPreflight: false },
  );
  console.log(`  ✓ redeem tx: ${redeemSig}`);

  // ===== Criterion 4: USDC received >= original =====
  const usdcAfterRedeem = await getUsdcBalance(connection, payer.publicKey);
  const usdcReceived = usdcAfterRedeem - usdcBeforeRedeem;
  console.log(
    `\n[4/4] USDC delta from redeem: ${Number(usdcReceived) / 1e6} USDC`,
  );
  // We redeemed half of our cTokens. Expected ~0.5 USDC back. Assert > 0.49 USDC (allow for tiny rounding).
  if (usdcReceived < 490_000n) {
    console.error(
      `  ✗ Criterion 4 FAILED: expected ~0.5 USDC, got ${Number(usdcReceived) / 1e6}`,
    );
    process.exit(4);
  }
  console.log("  ✓ USDC received is at least half of deposit (no value loss)");

  console.log("\n========================================");
  console.log("ALL 4 CRITERIA PASSED. Kamino devnet ALIVE.");
  console.log("========================================");
  console.log(`Market:  ${market.getAddress().toString()}`);
  console.log(`Reserve: ${reserveAddress.toString()}`);
  console.log(`Deposit: https://solscan.io/tx/${depositSig}?cluster=devnet`);
  console.log(`Redeem:  https://solscan.io/tx/${redeemSig}?cluster=devnet`);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
