// Off-ramp status poll. Returns depositAddress (where parent should send
// USDC) and the transaction's lifecycle state.

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
    const status = await orda.offRamp.getStatus(txId);
    return NextResponse.json({
      id: status.id,
      status: status.status,
      depositAddress: status.depositAddress,
      depositAmount: status.depositAmount,
      depositTxHash: status.depositTxHash,
      withdrawalAmount: status.withdrawalAmount,
      withdrawalDetails: status.withdrawalDetails,
      updatedAt: status.updatedAt,
    });
  } catch (err) {
    const { message, status } = ordaError(err);
    console.error("[orda/offramp/status] failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
