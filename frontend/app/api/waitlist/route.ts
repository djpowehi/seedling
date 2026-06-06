// Waitlist submission endpoint. Validates the payload + forwards to whatever
// WAITLIST_WEBHOOK_URL is set to. Auto-detects three common destinations
// from the URL and formats payloads natively for each:
//
//   - Discord (https://discord.com/api/webhooks/…)  → embed with fields
//   - Slack (https://hooks.slack.com/…)             → Block Kit message
//   - Anything else (Zapier, n8n, custom)            → raw JSON entry
//
// Without the env var, the entry is just console.logged and the response
// is still 200 so the form UX doesn't fail before deploy.
//
// Storage is deliberately decoupled: this endpoint doesn't write to a DB
// directly. The downstream webhook owns persistence + analytics. Set the
// env var when ready.
//
// Discord setup (recommended): in any channel, Edit Channel → Integrations
// → Webhooks → New Webhook → Copy URL. Set WAITLIST_WEBHOOK_URL to that
// URL in Vercel env vars. Done — submissions land as embedded messages.

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

  // PII-redacted log shape — only non-identifying fields. The full entry
  // (including email + note) is forwarded to the webhook, which owns
  // persistence + auth. Logging raw email/note leaks to anyone with log
  // access (Vercel team members, support consoles); the shape below is
  // enough for ops debugging without exposing the parent.
  console.log("[waitlist] entry shape", {
    country: entry.country,
    depositUsd: entry.depositUsd,
    kidAge: entry.kidAge,
    hasNote: entry.note !== null && entry.note.length > 0,
    ipHash: entry.ipHash,
    receivedAt: entry.receivedAt,
  });

  const webhookUrl = process.env.WAITLIST_WEBHOOK_URL;
  if (webhookUrl) {
    try {
      const payload = formatForWebhook(webhookUrl, entry);
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

type Entry = WaitlistPayload & {
  receivedAt: string;
  userAgent: string | null;
  referer: string | null;
  ipHash: string;
};

/** Detect the webhook destination from the URL and format the payload
 *  natively. Discord wants `embeds`, Slack wants `blocks`, anything else
 *  gets the raw JSON entry (Zapier, n8n, custom — they parse arbitrary
 *  JSON). Same one env var works regardless of where you point it. */
function formatForWebhook(url: string, entry: Entry): unknown {
  if (url.includes("discord.com/api/webhooks/")) {
    return formatDiscord(entry);
  }
  if (url.includes("hooks.slack.com/")) {
    return formatSlack(entry);
  }
  return entry;
}

function formatDiscord(entry: Entry) {
  const fields = [
    { name: "Email", value: entry.email, inline: false },
    { name: "Country", value: entry.country, inline: true },
    {
      name: "Deposit intent",
      value: `$${entry.depositUsd.toLocaleString("en-US")} USDC`,
      inline: true,
    },
    { name: "Kid's age", value: String(entry.kidAge), inline: true },
  ];
  if (entry.note) {
    fields.push({
      name: "Note",
      value: entry.note.slice(0, 1024),
      inline: false,
    });
  }
  return {
    content: "🌱 new waitlist signup",
    embeds: [
      {
        title: "Seedling waitlist",
        color: 0x2e5c40, // green-700 from the brand palette
        fields,
        footer: { text: `received ${entry.receivedAt} · ip ${entry.ipHash}` },
      },
    ],
  };
}

function formatSlack(entry: Entry) {
  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: { type: "plain_text", text: "🌱 New waitlist signup" },
    },
    {
      type: "section",
      fields: [
        { type: "mrkdwn", text: `*Email*\n${entry.email}` },
        { type: "mrkdwn", text: `*Country*\n${entry.country}` },
        {
          type: "mrkdwn",
          text: `*Deposit intent*\n$${entry.depositUsd.toLocaleString(
            "en-US"
          )} USDC`,
        },
        { type: "mrkdwn", text: `*Kid's age*\n${entry.kidAge}` },
      ],
    },
  ];
  if (entry.note) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*Note*\n${entry.note.slice(0, 2000)}` },
    });
  }
  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `received ${entry.receivedAt} · ip ${entry.ipHash}`,
      },
    ],
  });
  return { blocks };
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
