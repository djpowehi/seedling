// Off-ramp quote — USDC → BRL via PIX.
//
// Body: {
//   amountUsdc: number,
//   fromAddress: string,           // parent's Solana wallet
//   pixKey: string,                // recipient PIX key
//   kyc: { name, taxId, taxIdCountry, email }
// }
//
// Response: { transactionId, depositAddress, fromAmount, toAmount, exchangeRate }
//
// Off-ramp on Solana: Orda gives us a depositAddress; the parent's
// connected wallet sends USDC there. We don't use Orda's transactionRequest
// (that's EVM-shaped). Polling /status/:txId returns the depositAddress
// once the quote is confirmed.

import { NextResponse } from "next/server";
import { getOrda, ordaError } from "@/lib/orda";

type Body = {
  amountUsdc?: number;
  fromAddress?: string;
  pixKey?: string;
  kyc?: {
    name?: string;
    taxId?: string;
    taxIdCountry?: string;
    email?: string;
  };
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Body;
  const amount = Number(body.amountUsdc);
  const fromAddress = body.fromAddress;
  const pixKey = body.pixKey;
  const kyc = body.kyc;

  if (!amount || amount <= 0 || !Number.isFinite(amount)) {
    return NextResponse.json(
      { error: "amountUsdc must be > 0" },
      { status: 400 }
    );
  }
  if (!fromAddress) {
    return NextResponse.json(
      { error: "fromAddress required" },
      { status: 400 }
    );
  }
  if (!pixKey) {
    return NextResponse.json({ error: "pixKey required" }, { status: 400 });
  }
  if (!kyc?.name || !kyc?.taxId || !kyc?.email) {
    return NextResponse.json(
      { error: "kyc.name, kyc.taxId, kyc.email required" },
      { status: 400 }
    );
  }

  try {
    const orda = getOrda();
    const quote = await orda.offRamp.requestQuote({
      // Solana chain ID per Orda's enum (ChainId.SOLANA = 1001001).
      fromChain: "1001001",
      fromToken: "USDC",
      fromAddress,
      intent: { method: "fromAmount", value: String(amount) },
      kycInformation: {
        name: kyc.name,
        taxId: kyc.taxId,
        taxIdCountry: kyc.taxIdCountry || "BR",
        email: kyc.email,
      },
      fiatSettlementDetails: {
        toCurrency: "BRL",
        pixKey,
      },
    });

    return NextResponse.json({
      transactionId: quote.transactionId,
      fromAmount: quote.quote.fromAmount,
      toAmount: quote.quote.toAmount,
      exchangeRate: quote.quote.exchangeRate,
      estimatedDuration: quote.quote.estimatedDuration,
    });
  } catch (err) {
    const { message, status } = ordaError(err);
    console.error("[orda/offramp] quote failed:", message);
    return NextResponse.json({ error: message }, { status });
  }
}
