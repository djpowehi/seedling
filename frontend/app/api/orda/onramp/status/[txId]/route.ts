// On-ramp status poll — client polls every few seconds while waiting for
// PIX payment to clear and USDC to land in the destination wallet.

import { NextResponse } from "next/server";
import { getOrda, ordaError } from "@/lib/orda";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ txId: string }> }
) {
  const { txId } = await ctx.params;
  if (!txId) {
    return NextResponse.json({ error: "txId required" }, { status: 400 });
  }

  try {
    const orda = getOrda();
    const status = await orda.onRamp.getStatus(txId);
    return NextResponse.json({
      transactionId: status.transactionId,
      status: status.status,
      depositStatus: status.depositStatus,
      fiatAmount: status.fiatAmount,
      cryptoAmount: status.cryptoAmount,
      settlementAddress: status.settlementAddress,
      updatedAt: status.updatedAt,
    });
  } catch (err) {
    const { message, status } = ordaError(err);
    console.error("[orda/onramp/status] failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
