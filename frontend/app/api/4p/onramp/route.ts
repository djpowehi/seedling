// Create a Pix-in (on-ramp) order with 4P Finance.
//
// POST → { kind: "parent" | "gift", familyPda, amountBrl, cpf, email,
//          gifterName?, message? }
// Returns { txid, pixCopiaECola, customId, expiresInSeconds }.
//
// The hot wallet is always the receiver_wallet — when 4P confirms USDC
// has landed (webhook), we sign a `deposit` ix on the family's behalf.
// `kind` only affects the gift memo: parent top-ups carry no gift memo,
// gift orders carry `seedling-gift:<gifterName>` so the gift wall picks
// them up. Both paths credit the family via the same `deposit` ix.
//
// Docs: ../../../../docs/4p-finance-api.md

import { Connection, PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

import { createOnrampOrder } from "@/lib/fourp";
import { getHotWalletPubkey } from "@/lib/hotWallet";
import { DEVNET_RPC } from "@/lib/program";
import { FAMILY_POSITION_DISCRIMINATOR } from "@/lib/quasar-client";

// 4P Pix charge TTL. 1 hour gives the parent enough time to open their
// bank app and pay; max allowed by 4P is 72h (259200s).
const PIX_EXPIRES_SECONDS = 60 * 60;

// Min/max BRL amount per single charge — guardrails against typos and
// abuse. Hackathon demo lives in this range; raise for prod.
const MIN_BRL = 1;
const MAX_BRL = 5000;

const MAX_GIFTER_NAME_LEN = 32;

// Strict CPF validator: 11 digits + checksum. Rejects all-same digits
// (a known invalid pattern) and verifies the two trailing check digits.
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

  const d1 = calcCheck(digits.slice(0, 9), 10);
  if (d1 !== Number(digits[9])) return false;
  const d2 = calcCheck(digits.slice(0, 10), 11);
  if (d2 !== Number(digits[10])) return false;

  return true;
}

function sanitizeGifterName(raw: string): string {
  const cleaned = Array.from(raw)
    .filter((c) => {
      const cp = c.codePointAt(0) ?? 0;
      return cp >= 0x20 && cp !== 0x7f;
    })
    .join("")
    .trim();
  return cleaned.slice(0, MAX_GIFTER_NAME_LEN);
}

interface OnrampRequest {
  kind: "parent" | "gift";
  familyPda: string;
  amountBrl: number;
  cpf: string;
  email: string;
  gifterName?: string;
  /** Lazy-creation context. If present, the family doesn't exist on-chain
   *  yet — webhook will prepend a create_family ix so the family is born
   *  and funded atomically with the first deposit. */
  lazyCreate?: {
    parent: string; // base58
    kid: string; // base58 — 32-byte client-generated identifier
    streamRateBaseUnits: string; // u64 as decimal string (BigInt-safe over JSON)
  };
}

function getOriginFromRequest(req: NextRequest): string {
  // Prefer x-forwarded-host (Vercel sets this with the public hostname).
  // Fall back to the request URL origin so local dev "just works".
  const forwardedHost = req.headers.get("x-forwarded-host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) return `${proto}://${forwardedHost}`;
  return new URL(req.url).origin;
}

export async function POST(req: NextRequest) {
  let body: OnrampRequest;
  try {
    body = (await req.json()) as OnrampRequest;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // ---- validation ----
  if (body.kind !== "parent" && body.kind !== "gift") {
    return NextResponse.json(
      { error: "kind must be 'parent' or 'gift'" },
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

  if (
    typeof body.amountBrl !== "number" ||
    !Number.isFinite(body.amountBrl) ||
    body.amountBrl < MIN_BRL ||
    body.amountBrl > MAX_BRL
  ) {
    return NextResponse.json(
      { error: `amountBrl must be between R$${MIN_BRL} and R$${MAX_BRL}` },
      { status: 400 }
    );
  }

  if (typeof body.cpf !== "string" || !isValidCpf(body.cpf)) {
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

  // ---- validate lazyCreate (if provided) ----
  let lazyCreate: {
    parent: PublicKey;
    kid: PublicKey;
    streamRateBaseUnits: bigint;
  } | null = null;
  if (body.lazyCreate) {
    try {
      const parent = new PublicKey(body.lazyCreate.parent);
      const kid = new PublicKey(body.lazyCreate.kid);
      const streamRateBaseUnits = BigInt(body.lazyCreate.streamRateBaseUnits);
      if (streamRateBaseUnits <= BigInt(0)) {
        return NextResponse.json(
          { error: "lazyCreate.streamRateBaseUnits must be > 0" },
          { status: 400 }
        );
      }
      lazyCreate = { parent, kid, streamRateBaseUnits };
    } catch {
      return NextResponse.json(
        { error: "lazyCreate fields are malformed" },
        { status: 400 }
      );
    }
  }

  // ---- family existence check ----
  // Skip when lazyCreate is set — the family doesn't exist YET, but the
  // webhook will create it atomically with the first deposit. For non-lazy
  // calls (deposits to an already-existing family) we keep the early
  // rejection so we don't take 4P money for a family the program would
  // refuse to deposit into.
  const connection = new Connection(DEVNET_RPC, "confirmed");
  if (!lazyCreate) {
    const familyInfo = await connection.getAccountInfo(familyPda, "confirmed");
    if (
      !familyInfo ||
      familyInfo.data[0] !== FAMILY_POSITION_DISCRIMINATOR[0]
    ) {
      return NextResponse.json({ error: "family not found" }, { status: 404 });
    }
  }

  // ---- build customId so the webhook can route the credit ----
  // Base format: <kind>:<familyPda>:<gifterName?>:<random>
  // Lazy-create suffix (optional): :lc:<parent>:<kid>:<streamRate>
  // Webhook parses both halves to know whether to prepend a create_family
  // ix to the deposit tx. Random suffix guarantees uniqueness even if the
  // same parent submits twice in the same second.
  const random = crypto.randomUUID();
  const gifterSlug =
    body.kind === "gift" && body.gifterName
      ? sanitizeGifterName(body.gifterName).replace(/:/g, "_")
      : "";
  const baseCustomId = `${body.kind}:${body.familyPda}:${gifterSlug}:${random}`;
  const customId = lazyCreate
    ? `${baseCustomId}:lc:${lazyCreate.parent.toBase58()}:${lazyCreate.kid.toBase58()}:${lazyCreate.streamRateBaseUnits.toString()}`
    : baseCustomId;

  // 4P custom_id max length is 255. Worst case with lazyCreate:
  // kind(6) + ":" + pda(44) + ":" + gifterSlug(32) + ":" + uuid(36) +
  // ":lc:" + parent(44) + ":" + kid(44) + ":" + rate(20) ≈ 240 chars.
  if (customId.length > 255) {
    return NextResponse.json(
      { error: "internal: customId exceeds 4P limit" },
      { status: 500 }
    );
  }

  const origin = getOriginFromRequest(req);
  const webhookToken = process.env.FOURP_WEBHOOK_TOKEN ?? "";
  const notificationUrl = `${origin}/api/4p/webhook?token=${webhookToken}`;

  const description =
    body.kind === "gift"
      ? `Gift via Seedling${
          body.gifterName ? ` — ${sanitizeGifterName(body.gifterName)}` : ""
        }`.slice(0, 140)
      : "Seedling top-up".slice(0, 140);

  // ---- call 4P ----
  try {
    const order = await createOnrampOrder({
      cpf: body.cpf.replace(/\D/g, ""),
      email: body.email,
      amountBrl: body.amountBrl,
      expiresSeconds: PIX_EXPIRES_SECONDS,
      customId,
      description,
      notificationUrl,
      receiverWallet: getHotWalletPubkey().toBase58(),
    });

    return NextResponse.json({
      txid: order.txid,
      pixCopiaECola: order.pixCopiaECola,
      customId,
      expiresInSeconds: order.expiresInSeconds,
      // Helpful for the UI to display "valid until 12:34" without
      // recomputing client-side.
      createdAt: order.createdAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    // Don't leak the API key in the response body. The error message
    // from fourp.ts already includes status + 4P's own message; if the
    // key is rejected the user just sees "401 — not authorized".
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
