// Server-only Orda SDK singleton. Lives in lib/ so any /api/orda/* route
// shares the same authenticated client (HMAC mode via clientId/secret).
//
// Never import this file from a "use client" component — the secret would
// leak into the browser bundle.

import { OrdaSDK } from "@ordanetwork/sdk";

const CLIENT_ID = process.env.ORDA_CLIENT_ID;
const CLIENT_SECRET = process.env.ORDA_CLIENT_SECRET;

let cached: OrdaSDK | null = null;

export function getOrda(): OrdaSDK {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Server missing ORDA_CLIENT_ID or ORDA_CLIENT_SECRET — set them in .env.local (and Vercel)"
    );
  }
  if (!cached) {
    cached = new OrdaSDK({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      requestTimeout: 30_000,
      enableTimestamp: true,
    });
  }
  return cached;
}

export function ordaError(err: unknown): { message: string; status: number } {
  // Orda SDK throws errors with .statusCode, .message, and sometimes a .body
  // object containing the API's actual error detail. We surface as much as
  // we can so the client gets a useful message instead of "BadRequest".
  const e = err as {
    message?: string;
    statusCode?: number;
    body?: unknown;
    response?: unknown;
  };
  const status = Number(e?.statusCode) || 500;
  let detail = "";
  const body = e?.body ?? e?.response;
  if (body && typeof body === "object") {
    const b = body as { error?: string; message?: string; detail?: string };
    detail = b.error || b.message || b.detail || JSON.stringify(body);
  } else if (typeof body === "string") {
    detail = body;
  }
  const message = detail
    ? `${e?.message || "Orda request failed"} — ${detail}`
    : e?.message || "Orda request failed";
  return { message, status };
}
