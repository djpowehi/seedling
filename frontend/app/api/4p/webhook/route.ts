// 4P Finance webhook receiver. 4P POSTs here twice per on-ramp order:
//   1. After Pix payment confirmation (status = "paid")
//   2. After USDC delivery on Solana to our hot wallet (status = "paid"
//      with custom_data.transaction_hash present)
//
// On step (2), we credit the destination family by signing a `deposit`
// instruction with the hot wallet as `depositor`. The customId carries
// the routing info (kind + familyPda + gifterName) — see onramp/route.ts.
//
// Security:
// - Token check: notification_url carries `?token=<FOURP_WEBHOOK_TOKEN>`,
//   we reject any request without the matching token.
// - IP allowlist: 4P documents 44.196.63.157 as the only outbound IP.
//   We log mismatches but accept them so localhost / preview deploys
//   from a tunnel still work; flip to hard-reject in prod once verified.
// - Idempotency: hasProcessedCustomId() scans recent hot-wallet txs for
//   a `cid:<customId>` memo. If found, we already deposited and skip.
//
// Docs: ../../../../docs/4p-finance-api.md

import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

import {
  FOURP_WEBHOOK_IP,
  getNotification,
  type Notification,
} from "@/lib/fourp";
import { hasProcessedCustomId, signAndSendUsdcTransfer } from "@/lib/hotWallet";

// 4P's webhook body shape — they only send a token, the actual data
// lives behind GET /notification/:token.
interface WebhookBody {
  token?: string;
  // 4P doesn't document this, but defensively accept either shape:
  notification_token?: string;
}

interface ParsedCustomId {
  kind: "parent" | "gift";
  /** Pix top-ups now route to the parent's USDC wallet, not a family
   *  vault. The customId carries the parent pubkey so the webhook can
   *  build the SPL Token transfer destination ATA. */
  parent: PublicKey;
  /** Optional family pubkey for gift attribution. Gifts still surface
   *  on a kid's gift wall, so we keep the kid-level identity here even
   *  though the on-chain destination is the parent's wallet. The gift
   *  wall fetcher matches on the gifter memo + the parent pubkey. */
  familyPda: PublicKey | null;
  gifterName: string | null;
  raw: string;
}

function parseCustomId(raw: string): ParsedCustomId | null {
  // New format (post wallet-routing refactor):
  //   <kind>:<parent>:<gifterName?>:<uuid>[:f:<familyPda>]
  //
  // Backward-compat: orders generated before this refactor used the
  // pattern <kind>:<familyPda>:<gifterName?>:<uuid>[:lc:<parent>:<kid>:<streamRate>].
  // We can recognize the legacy shape by the presence of a `:lc:` segment
  // at index 4 — those orders need to be rejected because we no longer
  // know how to fulfil them (the deposit-to-vault path is gone).
  const parts = raw.split(":");
  if (parts.length < 4) return null;
  const [kind, firstPubkeyStr, gifterSlug] = parts;
  if (kind !== "parent" && kind !== "gift") return null;

  // Legacy lazy-create order — reject. Pre-refactor orders are dead.
  if (parts[4] === "lc") return null;

  let parent: PublicKey;
  try {
    parent = new PublicKey(firstPubkeyStr);
  } catch {
    return null;
  }

  // Optional family marker for gift attribution.
  let familyPda: PublicKey | null = null;
  if (parts.length >= 6 && parts[4] === "f") {
    try {
      familyPda = new PublicKey(parts[5]);
    } catch {
      return null;
    }
  }

  return {
    kind,
    parent,
    familyPda,
    gifterName: kind === "gift" && gifterSlug ? gifterSlug : null,
    raw,
  };
}

// 4P's amount field for USDC delivery is a string in the response. The
// notification's `amount` field is the original BRL charge; the actual
// USDC delivered is in custom_data.amount_usdt (named that way regardless
// of the asset). We convert to base units (6 decimals).
function parseUsdcBaseUnits(notification: Notification): bigint | null {
  const raw = notification.customData?.amountUsdt;
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return BigInt(Math.round(n * 1_000_000));
}

function isCryptoDeliveredNotification(n: Notification): boolean {
  // Step 2 notifications carry a Solana transaction_hash in custom_data.
  // Step 1 (Pix paid) and any Pix-only notifications don't.
  return Boolean(n.customData?.transactionHash);
}

export async function POST(req: NextRequest) {
  // ---- request-token check (cheap; reject early) ----
  const url = new URL(req.url);
  const tokenInUrl = url.searchParams.get("token");
  const expectedToken = process.env.FOURP_WEBHOOK_TOKEN;
  if (!expectedToken) {
    console.error("[4p webhook] FOURP_WEBHOOK_TOKEN not set");
    return NextResponse.json(
      { error: "server misconfigured" },
      { status: 500 }
    );
  }
  if (tokenInUrl !== expectedToken) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  // ---- IP allowlist (soft for now) ----
  // Vercel sets x-forwarded-for as a comma-separated list; first entry
  // is the real client. Some preview environments (and local tunnels)
  // hide the upstream IP — we log + continue rather than hard-reject so
  // smoke tests work. Flip this to a 403 once production is verified.
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const callerIp = xff.split(",")[0].trim();
  if (callerIp && callerIp !== FOURP_WEBHOOK_IP) {
    console.warn(
      `[4p webhook] caller ip ${callerIp} != allowlisted ${FOURP_WEBHOOK_IP}`
    );
  }

  // ---- parse body ----
  let body: WebhookBody;
  try {
    body = (await req.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const notificationToken = body.token ?? body.notification_token;
  if (!notificationToken || typeof notificationToken !== "string") {
    return NextResponse.json(
      { error: "missing notification token" },
      { status: 400 }
    );
  }

  // ---- fetch the actual transaction state from 4P ----
  let notification: Notification;
  try {
    notification = await getNotification(notificationToken);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error("[4p webhook] getNotification failed:", msg);
    // Return 200 so 4P doesn't retry into a permanent error. We log
    // for human follow-up via the sweep route.
    return NextResponse.json({ ok: true, note: "fetch_failed" });
  }

  console.log(
    `[4p webhook] customId=${notification.customId} status=${
      notification.status
    } cryptoDelivered=${isCryptoDeliveredNotification(notification)}`
  );

  // ---- only act on step-2 (crypto-delivered) notifications ----
  // Step 1 (Pix paid) is informational — we wait for 4P to actually
  // send us USDC before signing a deposit.
  if (!isCryptoDeliveredNotification(notification)) {
    return NextResponse.json({ ok: true, note: "pix_paid_acked" });
  }

  if (notification.status !== "paid" && notification.status !== "success") {
    console.warn(
      `[4p webhook] unexpected status="${notification.status}" — skipping`
    );
    return NextResponse.json({ ok: true, note: "non_terminal_status" });
  }

  // ---- parse customId ----
  const parsed = parseCustomId(notification.customId);
  if (!parsed) {
    console.error(
      `[4p webhook] malformed customId: "${notification.customId}"`
    );
    return NextResponse.json({ ok: true, note: "bad_custom_id" });
  }

  // ---- compute amount ----
  const amountBaseUnits = parseUsdcBaseUnits(notification);
  if (!amountBaseUnits) {
    console.error(
      `[4p webhook] missing/invalid amount_usdt in custom_data for ${parsed.raw}`
    );
    return NextResponse.json({ ok: true, note: "bad_amount" });
  }

  // ---- idempotency: skip if we already deposited this customId ----
  let alreadyProcessed = false;
  try {
    alreadyProcessed = await hasProcessedCustomId(parsed.raw);
  } catch (e) {
    // Don't fail the webhook on idempotency check error; downstream
    // sweep/manual recovery will catch any stuck funds.
    console.error("[4p webhook] idempotency check failed:", e);
  }
  if (alreadyProcessed) {
    return NextResponse.json({ ok: true, note: "already_processed" });
  }

  // ---- credit the parent's wallet ----
  try {
    const result = await signAndSendUsdcTransfer({
      parent: parsed.parent,
      amountBaseUnits,
      customId: parsed.raw,
      gifterName: parsed.gifterName,
    });
    console.log(
      `[4p webhook] credited parent=${parsed.parent.toBase58()} amount=${
        result.amountBaseUnits
      } sig=${result.signature}`
    );
    return NextResponse.json({
      ok: true,
      signature: result.signature,
      parent: parsed.parent.toBase58(),
      family: parsed.familyPda?.toBase58() ?? null,
      kind: parsed.kind,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    console.error(`[4p webhook] deposit failed for ${parsed.raw}:`, msg);
    // Return 200 so 4P doesn't bombard us with retries — the funds are
    // safe in the hot wallet and the sweep route will pick this up.
    return NextResponse.json({
      ok: true,
      note: "deposit_failed_pending_sweep",
      error: msg,
    });
  }
}
