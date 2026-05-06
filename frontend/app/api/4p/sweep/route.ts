// Operator-driven recovery endpoint for stuck 4P deposits.
//
// Why this exists: if 4P confirms USDC delivery but our deposit ix
// fails (RPC blip, oracle staleness, CU exhaust, etc.), USDC sits in
// the hot wallet's USDC ATA un-credited. 4P does not expose a "list
// my pending orders" endpoint, so we cannot auto-enumerate which
// customIds are stuck. The webhook handler logs every failure with
// the full customId; an operator pulls that customId from Vercel
// logs and POSTs here to retry the deposit.
//
// Auth: same FOURP_WEBHOOK_TOKEN as the webhook (strong secret,
// shared between webhook + sweep — both are operator-only paths).
//
// Two methods:
//   GET  → diagnostics (hot wallet pubkey, USDC balance, recent
//          signature activity). No body. Use this to see if anything
//          is stuck and to verify the env is wired up correctly.
//   POST → retry a specific customId. Requires { customId, familyPda,
//          amountBaseUnits, gifterName? } in the body. Calls the same
//          idempotency check + deposit path the webhook would.
//
// For full auto-recovery we'd need a KV store of pending customIds.
// Deliberately deferred — hackathon volume doesn't justify the infra
// and the manual path covers the failure mode.

import { Connection, PublicKey } from "@solana/web3.js";
import {
  AccountLayout,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { NextRequest, NextResponse } from "next/server";

import {
  getHotWalletPubkey,
  getHotWalletUsdcAta,
  hasProcessedCustomId,
  signAndSendDeposit,
} from "@/lib/hotWallet";
import { DEVNET_ADDRESSES, DEVNET_RPC } from "@/lib/program";

interface RetryRequest {
  customId: string;
  familyPda: string;
  amountBaseUnits: string; // bigint as string — JSON can't carry bigint
  gifterName?: string;
}

function authorized(req: NextRequest): boolean {
  const expected = process.env.FOURP_WEBHOOK_TOKEN;
  if (!expected) return false;
  // Accept either a Bearer header or a `?token=` query param. The
  // webhook uses the query string; CLI operators may prefer headers.
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ")
    ? header.slice("bearer ".length).trim()
    : "";
  const queryToken = new URL(req.url).searchParams.get("token") ?? "";
  return bearer === expected || queryToken === expected;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const connection = new Connection(DEVNET_RPC, "confirmed");
  const hotWallet = getHotWalletPubkey();
  const hotWalletUsdcAta = getHotWalletUsdcAta();

  const [solBalance, ataInfo, recentSigs] = await Promise.all([
    connection.getBalance(hotWallet, "confirmed"),
    connection.getAccountInfo(hotWalletUsdcAta, "confirmed"),
    connection.getSignaturesForAddress(hotWallet, { limit: 10 }),
  ]);

  let usdcBaseUnits: string | null = null;
  if (ataInfo) {
    const decoded = AccountLayout.decode(ataInfo.data);
    usdcBaseUnits = decoded.amount.toString();
  }

  return NextResponse.json({
    hotWallet: hotWallet.toBase58(),
    hotWalletUsdcAta: hotWalletUsdcAta.toBase58(),
    usdcMint: DEVNET_ADDRESSES.usdcMint.toBase58(),
    solLamports: solBalance,
    solUi: solBalance / 1e9,
    usdcBaseUnits,
    usdcUi: usdcBaseUnits ? Number(usdcBaseUnits) / 1e6 : null,
    recentSignatures: recentSigs.map((s) => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: s.blockTime,
      err: s.err,
    })),
    note:
      usdcBaseUnits && usdcBaseUnits !== "0"
        ? "Hot wallet holds undeposited USDC — pull customId from logs and POST to /api/4p/sweep to retry."
        : "Clean — no stuck funds.",
  });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: RetryRequest;
  try {
    body = (await req.json()) as RetryRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (!body.customId || typeof body.customId !== "string") {
    return NextResponse.json({ error: "missing customId" }, { status: 400 });
  }
  if (!body.familyPda || typeof body.familyPda !== "string") {
    return NextResponse.json({ error: "missing familyPda" }, { status: 400 });
  }
  if (!body.amountBaseUnits || typeof body.amountBaseUnits !== "string") {
    return NextResponse.json(
      { error: "missing amountBaseUnits (string-encoded bigint)" },
      { status: 400 }
    );
  }

  let familyPda: PublicKey;
  try {
    familyPda = new PublicKey(body.familyPda);
  } catch {
    return NextResponse.json(
      { error: "familyPda is not a valid pubkey" },
      { status: 400 }
    );
  }

  let amountBaseUnits: bigint;
  try {
    amountBaseUnits = BigInt(body.amountBaseUnits);
    if (amountBaseUnits <= BigInt(0)) throw new Error("non-positive");
  } catch {
    return NextResponse.json(
      { error: "amountBaseUnits is not a valid positive bigint" },
      { status: 400 }
    );
  }

  // Re-run the same idempotency check the webhook does. This makes
  // double-clicking the retry button harmless.
  try {
    if (await hasProcessedCustomId(body.customId)) {
      return NextResponse.json({
        ok: true,
        note: "already_processed",
      });
    }
  } catch (e) {
    console.error("[4p sweep] idempotency check failed:", e);
    // Continue anyway — operator-driven retries should err toward
    // attempting the deposit if the check itself broke.
  }

  try {
    const result = await signAndSendDeposit({
      familyPda,
      amountBaseUnits,
      customId: body.customId,
      gifterName: body.gifterName ?? null,
    });
    return NextResponse.json({
      ok: true,
      signature: result.signature,
      family: familyPda.toBase58(),
      customId: body.customId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json(
      { ok: false, error: msg, customId: body.customId },
      { status: 500 }
    );
  }
}
