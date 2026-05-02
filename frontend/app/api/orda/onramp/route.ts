// On-ramp quote — BRL → USDC via PIX.
//
// Body: { amountBrl: number, toAddress: string }
// Response: { transactionId, pixQrCode, pixKey, amount, expiresAt, toAmount }

import { NextResponse } from "next/server";
import { getOrda, ordaError } from "@/lib/orda";

type Body = {
  amountBrl?: number;
  toAddress?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const amount = Number(body.amountBrl);
  const toAddress = body.toAddress;

  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    return NextResponse.json(
      { error: "amountBrl must be > 0" },
      { status: 400 }
    );
  }
  if (!toAddress || typeof toAddress !== "string") {
    return NextResponse.json({ error: "toAddress required" }, { status: 400 });
  }

  try {
    const orda = getOrda();
    const quote = await orda.onRamp.requestQuote({
      fromCurrency: "BRL",
      intent: { method: "fromAmount", value: String(amount) },
      settlementDetails: {
        // Orda uses numeric chain IDs. Solana = 1001001 (per
        // @ordanetwork/sdk ChainId enum). Sending "solana" as a string
        // gets rejected with "expected unsupported chain" because the
        // validator only matches numeric IDs.
        toChain: "1001001",
        toToken: "USDC",
        toAddress,
      },
    });

    return NextResponse.json({
      transactionId: quote.transactionId,
      pixQrCode: quote.depositInstructions.pixQrCode ?? null,
      pixKey: quote.depositInstructions.pixKey ?? null,
      amount: quote.depositInstructions.amount,
      currency: quote.depositInstructions.currency,
      referenceId: quote.depositInstructions.referenceId,
      expiresAt: quote.depositInstructions.expiresAt,
      toAmount: quote.quote.toAmount,
      exchangeRate: quote.quote.exchangeRate,
    });
  } catch (err) {
    const { message, status } = ordaError(err);
    // Log the full error object server-side so we can see what Orda actually
    // returned (status, body, headers). Keep this even after debugging — when
    // a real user sees "BadRequest" we want to be able to look at the log
    // and tell them what was wrong with their input.
    console.error("[orda/onramp] quote failed:", { message, status, err });
    return NextResponse.json({ error: message }, { status });
  }
}
