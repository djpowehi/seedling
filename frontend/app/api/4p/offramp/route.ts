// Create a Pix-out (off-ramp) order with 4P Finance.
//
// POST → { familyPda, parentPubkey, amountUsdc, destinationPixKey, cpf, email }
// Returns { sharesToBurn, minAssetsOut, receiverWallet, customId, amountBrl,
//           txid, expiresAtUnix }.
//
// The route validates state and creates the 4P order, but does NOT build
// the tx. Client builds + signs the [withdraw + transferChecked] combo
// using the returned share calc + receiver wallet — single signature for
// the parent, then 4P delivers Pix automatically.
//
// Docs: ../../../../docs/4p-finance-api.md

import { Connection, PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

import { createOfframpOrder } from "@/lib/fourp";
import { MAINNET_ADDRESSES, MAINNET_RPC } from "@/lib/program";
import {
  FAMILY_POSITION_DISCRIMINATOR,
  FamilyPositionCodec,
  VAULT_CONFIG_DISCRIMINATOR,
  VaultConfigCodec,
} from "@/lib/quasar-client";

const MIN_USDC = 1;
const MAX_USDC = 5000;

// 2% buffer above the lastKnownTotalAssets-derived estimate so the actual
// withdraw clears `minAssetsOut`. Buffer goes into shares burned, not into
// fees — the extra USDC stays in the parent's ATA as dust they can leave
// or sweep later.
const SHARES_BUFFER_BPS = 200; // 200 bps = 2%

interface OfframpRequest {
  familyPda: string;
  parentPubkey: string;
  amountUsdc: number;
  destinationPixKey: string;
  cpf: string;
  email: string;
}

function isValidCpf(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const calcCheck = (slice: string, weightStart: number) => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * (weightStart - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  if (calcCheck(digits.slice(0, 9), 10) !== Number(digits[9])) return false;
  if (calcCheck(digits.slice(0, 10), 11) !== Number(digits[10])) return false;
  return true;
}

function getOriginFromRequest(req: NextRequest): string {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${proto}://${forwardedHost}`;
  return new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  let body: OfframpRequest;
  try {
    body = (await req.json()) as OfframpRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // ---- validation ----
  let familyPda: PublicKey;
  let parentPubkey: PublicKey;
  try {
    familyPda = new PublicKey(body.familyPda);
    parentPubkey = new PublicKey(body.parentPubkey);
  } catch {
    return NextResponse.json(
      { error: "familyPda or parentPubkey is invalid" },
      { status: 400 }
    );
  }

  if (
    typeof body.amountUsdc !== "number" ||
    !Number.isFinite(body.amountUsdc) ||
    body.amountUsdc < MIN_USDC ||
    body.amountUsdc > MAX_USDC
  ) {
    return NextResponse.json(
      { error: `amountUsdc must be between $${MIN_USDC} and $${MAX_USDC}` },
      { status: 400 }
    );
  }

  if (!isValidCpf(body.cpf)) {
    return NextResponse.json(
      { error: "cpf is invalid (must be 11 digits with valid checksum)" },
      { status: 400 }
    );
  }

  if (
    typeof body.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
  ) {
    return NextResponse.json({ error: "email is invalid" }, { status: 400 });
  }

  if (
    typeof body.destinationPixKey !== "string" ||
    body.destinationPixKey.trim().length < 5
  ) {
    return NextResponse.json(
      { error: "destinationPixKey is invalid" },
      { status: 400 }
    );
  }

  // ---- read on-chain state ----
  const connection = new Connection(MAINNET_RPC, "confirmed");
  const [familyInfo, vaultInfo] = await Promise.all([
    connection.getAccountInfo(familyPda, "confirmed"),
    connection.getAccountInfo(MAINNET_ADDRESSES.vaultConfig, "confirmed"),
  ]);

  if (!familyInfo || familyInfo.data[0] !== FAMILY_POSITION_DISCRIMINATOR[0]) {
    return NextResponse.json({ error: "family not found" }, { status: 404 });
  }
  if (!vaultInfo || vaultInfo.data[0] !== VAULT_CONFIG_DISCRIMINATOR[0]) {
    return NextResponse.json({ error: "vault not found" }, { status: 500 });
  }

  const family = FamilyPositionCodec.decode(familyInfo.data.subarray(1));
  const vault = VaultConfigCodec.decode(vaultInfo.data.subarray(1));

  // Parent ownership check — only the registered parent of this family
  // can off-ramp from it. Prevents some random visitor from triggering
  // a withdraw on someone else's vault.
  if (family.parent.toBase58() !== parentPubkey.toBase58()) {
    return NextResponse.json(
      { error: "parentPubkey does not match family.parent" },
      { status: 403 }
    );
  }

  if (
    vault.totalShares === BigInt(0) ||
    vault.lastKnownTotalAssets === BigInt(0)
  ) {
    return NextResponse.json(
      { error: "vault is empty — nothing to withdraw" },
      { status: 409 }
    );
  }

  // ---- compute shares needed ----
  // sharesToBurn = ceil(amountUsdc × totalShares / totalAssets × (1 + buffer))
  // We use BigInt math throughout to keep precision; the buffer is
  // applied via integer multiplication to avoid float drift.
  const amountBaseUnits = BigInt(Math.round(body.amountUsdc * 1_000_000));
  const numerator =
    amountBaseUnits * vault.totalShares * BigInt(10_000 + SHARES_BUFFER_BPS);
  const denominator = vault.lastKnownTotalAssets * BigInt(10_000);
  // Ceil division: (a + b - 1) / b
  let sharesToBurn = (numerator + denominator - BigInt(1)) / denominator;

  // Clamp to the family's actual shares so we never try to burn more
  // than they have. If the buffer would push us over, just burn all.
  if (sharesToBurn > family.shares) {
    sharesToBurn = family.shares;
  }

  if (sharesToBurn === BigInt(0)) {
    return NextResponse.json(
      { error: "amount too small — would burn 0 shares" },
      { status: 400 }
    );
  }

  // ---- build customId ----
  // Off-ramp customIds are tracked separately from on-ramp; the webhook
  // doesn't act on them (the parent's wallet is what credits the family
  // for an on-ramp; off-ramp is purely informational from our side).
  const random = crypto.randomUUID();
  const customId = `offramp:${body.familyPda}::${random}`;

  const origin = getOriginFromRequest(req);
  const webhookToken = process.env.FOURP_WEBHOOK_TOKEN ?? "";
  const notificationUrl = `${origin}/api/4p/webhook?token=${webhookToken}`;

  // ---- call 4P ----
  try {
    const order = await createOfframpOrder({
      personDocument: body.cpf.replace(/\D/g, ""),
      email: body.email,
      amountUsdc: body.amountUsdc,
      customId,
      asset: "USDC",
      chain: "Solana",
      senderWallet: parentPubkey.toBase58(),
      destinationPixKey: body.destinationPixKey.trim(),
      notificationUrl,
    });

    return NextResponse.json({
      sharesToBurn: sharesToBurn.toString(),
      // minAssetsOut = exactly the requested amount. Burn-buffer ensures
      // the actual withdrawal clears this floor.
      minAssetsOut: amountBaseUnits.toString(),
      receiverWallet: order.receiverWallet,
      amountBrl: order.amountBrl,
      asset: order.asset,
      chain: order.chain,
      txid: order.txid,
      customId,
      expiresAtUnix: order.expiresAtUnix,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
