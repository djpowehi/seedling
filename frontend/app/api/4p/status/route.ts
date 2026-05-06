// Polled by the Pix UI to know when the family has been credited.
// The webhook handler runs server-side; the client doesn't see the
// `cid:<customId>` memo land directly — it asks this endpoint
// instead. Returns { processed: boolean }.
//
// Auth: none. The customId is a UUID + family pubkey, so reading
// "is X processed" leaks nothing actionable. We do scope the check
// to the hot wallet's recent signatures (same pattern as the webhook
// idempotency check), so this endpoint won't tell anyone anything
// they couldn't learn by scanning the chain themselves.

import { NextRequest, NextResponse } from "next/server";

import { hasProcessedCustomId } from "@/lib/hotWallet";

export async function GET(req: NextRequest) {
  const customId = new URL(req.url).searchParams.get("customId");
  if (!customId) {
    return NextResponse.json(
      { error: "missing customId query param" },
      { status: 400 }
    );
  }

  try {
    const processed = await hasProcessedCustomId(customId);
    return NextResponse.json({ processed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
