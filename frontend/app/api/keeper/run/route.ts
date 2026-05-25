// Keeper cron endpoint. Vercel hits this once a day at 00:00 UTC; on the
// 1st of each month it fires monthly allowances, and whenever the bonus
// period has rolled it fires the 13th-allowance bonus.
//
// Auth: Vercel adds `Authorization: Bearer <CRON_SECRET>` to scheduled
// requests when CRON_SECRET is set in project env. Same secret protects
// manual POSTs so we can dry-run from a shell.
//
// Signer: the hot wallet (SEEDLING_HOT_WALLET_*) doubles as keeper.
// distribute_monthly_allowance + distribute_bonus are permissionless
// (program-side comment: "anyone can call"), so reusing the existing
// sponsor key is safe — neither role can move funds beyond paying its
// own SOL for fees. Halves the ops surface (one keypair, one SOL balance
// to monitor, one secret to rotate).

import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  SYSVAR_INSTRUCTIONS_PUBKEY,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { NextResponse } from "next/server";

import { getHotWalletKeypair } from "@/lib/hotWallet";
import { MAINNET_ADDRESSES, getConnection } from "@/lib/program";
import { SeedlingQuasarClient } from "@/lib/quasar-client";
import { kidViewPda as deriveKidViewPda } from "@/lib/quasarPdas";
import {
  fetchAllFamilies,
  fetchVaultConfig,
  isBonusEligible,
  isMonthlyEligible,
  isTodayFirstOfMonthUTC,
  type FamilyWithPubkey,
} from "@/lib/keeperFamilies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DistributionKind = "monthly" | "bonus";

type DispatchResult = {
  family: string;
  kind: DistributionKind;
  status: "sent" | "already_processed" | "skipped" | "error";
  signature?: string;
  reason?: string;
};

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

function buildKaminoAccounts() {
  const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("lma"), MAINNET_ADDRESSES.kaminoMarket.toBuffer()],
    MAINNET_ADDRESSES.klendProgram
  );
  return {
    kaminoReserve: MAINNET_ADDRESSES.kaminoReserve,
    lendingMarket: MAINNET_ADDRESSES.kaminoMarket,
    lendingMarketAuthority,
    reserveLiquiditySupply: MAINNET_ADDRESSES.reserveLiquiditySupply,
    oraclePyth: MAINNET_ADDRESSES.oraclePyth,
    oracleSwitchboardPrice: MAINNET_ADDRESSES.klendProgram,
    oracleSwitchboardTwap: MAINNET_ADDRESSES.klendProgram,
    oracleScopeConfig: MAINNET_ADDRESSES.oracleScopeConfig,
    kaminoProgram: MAINNET_ADDRESSES.klendProgram,
    instructionSysvar: SYSVAR_INSTRUCTIONS_PUBKEY,
  };
}

function buildSharedAccounts(family: FamilyWithPubkey, keeper: PublicKey) {
  const kidView = deriveKidViewPda(family.parent, family.kid);
  const kidPoolAta = getAssociatedTokenAddressSync(
    MAINNET_ADDRESSES.usdcMint,
    family.pubkey,
    true
  );
  return {
    kidView,
    kidPoolAta,
    keeperAccounts: {
      keeper,
      familyPosition: family.pubkey,
      kidView,
      kidPoolAta,
      vaultUsdcAta: MAINNET_ADDRESSES.vaultUsdcAta,
      vaultCtokenAta: MAINNET_ADDRESSES.vaultCtokenAta,
      treasuryUsdcAta: MAINNET_ADDRESSES.treasury,
      vaultConfig: MAINNET_ADDRESSES.vaultConfig,
      usdcMint: MAINNET_ADDRESSES.usdcMint,
      ctokenMint: MAINNET_ADDRESSES.ctokenMint,
      ...buildKaminoAccounts(),
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    },
  };
}

async function dispatch(
  family: FamilyWithPubkey,
  kind: DistributionKind
): Promise<DispatchResult> {
  const keeper = getHotWalletKeypair();
  const connection = getConnection();
  const client = new SeedlingQuasarClient();
  const familyKey = family.pubkey.toBase58();

  try {
    const { kidPoolAta, keeperAccounts } = buildSharedAccounts(
      family,
      keeper.publicKey
    );

    const distributeIx =
      kind === "monthly"
        ? client.createDistributeMonthlyAllowanceInstruction(keeperAccounts)
        : client.createDistributeBonusInstruction(keeperAccounts);

    const tx = new Transaction();
    tx.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
      createAssociatedTokenAccountIdempotentInstruction(
        keeper.publicKey,
        kidPoolAta,
        family.pubkey,
        MAINNET_ADDRESSES.usdcMint
      ),
      distributeIx
    );

    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = keeper.publicKey;
    tx.sign(keeper);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );
    return { family: familyKey, kind, status: "sent", signature };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.toLowerCase().includes("already been processed")) {
      return { family: familyKey, kind, status: "already_processed" };
    }
    return { family: familyKey, kind, status: "error", reason: msg };
  }
}

async function runKeeper(): Promise<{
  summary: {
    families: number;
    monthlyEligible: number;
    bonusEligible: number;
    sent: number;
    errors: number;
  };
  results: DispatchResult[];
  todayIsFirstUTC: boolean;
}> {
  const connection = getConnection();
  const nowSec = Math.floor(Date.now() / 1000);
  const todayIsFirstUTC = isTodayFirstOfMonthUTC();

  const [families, vault] = await Promise.all([
    fetchAllFamilies(connection),
    fetchVaultConfig(connection),
  ]);

  const results: DispatchResult[] = [];

  // Serial dispatch — each tx fetches its own blockhash, and a single
  // keeper Keypair can't sign two txs in parallel without nonce conflict.
  for (const family of families) {
    if (isMonthlyEligible(family, nowSec, todayIsFirstUTC)) {
      results.push(await dispatch(family, "monthly"));
    }
    if (isBonusEligible(family, vault, nowSec)) {
      results.push(await dispatch(family, "bonus"));
    }
  }

  const monthlyEligible = results.filter((r) => r.kind === "monthly").length;
  const bonusEligible = results.filter((r) => r.kind === "bonus").length;
  const sent = results.filter((r) => r.status === "sent").length;
  const errors = results.filter((r) => r.status === "error").length;

  return {
    summary: {
      families: families.length,
      monthlyEligible,
      bonusEligible,
      sent,
      errors,
    },
    results,
    todayIsFirstUTC,
  };
}

async function handle(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runKeeper();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
