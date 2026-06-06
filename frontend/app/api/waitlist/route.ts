// Waitlist submission endpoint. Validates the payload + forwards to whatever
// WAITLIST_WEBHOOK_URL is set to (Zapier, Slack, n8n, custom — any POST sink
// that accepts JSON). Without the env var, the entry is just console.logged
// and the response is still 200 so the form UX doesn't fail before deploy.
//
// Storage is deliberately decoupled: this endpoint doesn't write to a DB
// directly. The downstream webhook owns persistence + analytics. Set the
// env var when ready.

import { NextRequest, NextResponse } from "next/server";

type WaitlistPayload = {
  email: string;
  country: string;
  depositUsd: number;
  kidAge: number;
  note: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(body: unknown): WaitlistPayload | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Body must be an object" };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.email !== "string" || !EMAIL_RE.test(b.email.trim())) {
    return { error: "Invalid email" };
  }
  if (typeof b.country !== "string" || b.country.length === 0) {
    return { error: "Country required" };
  }
  if (
    typeof b.depositUsd !== "number" ||
    !Number.isFinite(b.depositUsd) ||
    b.depositUsd < 0 ||
    b.depositUsd > 10_000_000
  ) {
    return { error: "Invalid deposit amount" };
  }
  if (
    typeof b.kidAge !== "number" ||
    !Number.isInteger(b.kidAge) ||
    b.kidAge < 0 ||
    b.kidAge > 25
  ) {
    return { error: "Invalid kid age" };
  }
  const note = b.note;
  if (note !== null && (typeof note !== "string" || note.length > 500)) {
    return { error: "Note too long" };
  }

  return {
    email: b.email.trim().toLowerCase(),
    country: b.country,
    depositUsd: b.depositUsd,
    kidAge: b.kidAge,
    note: note as string | null,
  };
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validated = validate(body);
  if ("error" in validated) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  // Augment with server-side metadata so the downstream webhook gets
  // enough context for spam-filtering + dedupe without us needing a DB.
  const entry = {
    ...validated,
    receivedAt: new Date().toISOString(),
    userAgent: req.headers.get("user-agent") ?? null,
    referer: req.headers.get("referer") ?? null,
    // IP is best-effort — Vercel sets x-forwarded-for; behind any other
    // proxy we just get whatever's in the standard header.
    ipHash: hashIp(
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
    ),
  };

  console.log("[waitlist] entry", entry);

  const webhookUrl = process.env.WAITLIST_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (!res.ok) {
        // Don't fail the user's submission if the downstream sink hiccups —
        // we already have the entry in our logs. Surface to ops via the log.
        console.error(
          `[waitlist] webhook returned ${res.status}`,
          await res.text().catch(() => "")
        );
      }
    } catch (e) {
      console.error("[waitlist] webhook failed", e);
    }
  } else {
    console.warn(
      "[waitlist] WAITLIST_WEBHOOK_URL not set — entry kept only in logs"
    );
  }

  return NextResponse.json({ ok: true });
}

// Lightweight non-cryptographic hash for IP correlation in the webhook
// payload. Cryptographic-grade isn't needed (and we don't want raw IPs in
// downstream tools) — this is just enough to spot patterns like one IP
// submitting 50x.
function hashIp(ip: string): string {
  let h = 2166136261;
  for (let i = 0; i < ip.length; i++) {
    h ^= ip.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
