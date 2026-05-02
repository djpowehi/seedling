// Orda JWT issuance — exchanges our server-only client_id/secret for a
// short-lived JWT the browser can hand to the Orda widget. Keeps the
// secret out of the client bundle.
//
// Per Orda's quickstart docs (https://orda.network/docs), the widget
// calls this endpoint, gets back { jwt, expiresAt }, and uses the token
// for all widget API calls. When the token nears expiry the widget
// automatically calls back here for a fresh one.

import { NextResponse } from "next/server";
import { JWT, UniversalHttpClient } from "@ordanetwork/sdk";

const CLIENT_ID = process.env.ORDA_CLIENT_ID;
const CLIENT_SECRET = process.env.ORDA_CLIENT_SECRET;
const API_URL =
  process.env.NEXT_PUBLIC_ORDA_API_BASE_URL ?? "https://api.orda.network/v1";

export async function POST() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json(
      { error: "Server missing ORDA_CLIENT_ID or ORDA_CLIENT_SECRET" },
      { status: 500 }
    );
  }

  try {
    const httpClient = new UniversalHttpClient(API_URL, 30_000);
    const jwtApi = new JWT(httpClient);

    const { token, expiresAt } = await jwtApi.generate({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      // Permissions match the widget's needs: it reads quotes, prices,
      // balances; manages recipients; and tracks transactions. Read-only
      // on transactions because parent-side flows fund their own wallet,
      // they don't need write access to other people's transactions.
      permissions: [
        "quotes:read",
        "offramp:read",
        "onramp:read",
        "transactions:read",
        "recipients:read",
        "recipients:write",
        "balances:read",
        "prices:read",
      ],
    });

    return NextResponse.json({
      jwt: token,
      // Widget expects expiresAt as Unix seconds (not the ISO string the
      // SDK returns). Convert here so the widget hydrates correctly.
      expiresAt: Math.floor(new Date(expiresAt).getTime() / 1000),
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "JWT generation failed";
    const status =
      typeof err === "object" && err !== null && "statusCode" in err
        ? (err as { statusCode: number }).statusCode
        : 500;
    console.error("[orda-jwt] generation failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
