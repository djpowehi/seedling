// Solana Pay transaction-request endpoint for gifts.
//
// GET  → returns { label, icon } (wallet shows this before the user signs)
// POST → receives { account }, returns { transaction: base64, message }
//
// The endpoint mints a real `deposit` transaction with `depositor = account`,
// so anyone with a wallet (grandma, classmate, anonymous gifter) can fund
// any family vault. The depositor signs in their wallet; we never sign.
//
// Optional `?from=Grandma` query param attaches an SPL Memo instruction
// before the deposit, encoding the gifter's self-chosen display name.
// fetchGifts decodes that on the kid view so "Grandma" shows up the
// instant the tx confirms — no parent action required.
//
// Solana Pay spec: https://docs.solanapay.com/spec#specification-transaction-request
//
// Why this is its own route: the QR encoded on the kid view is
//   solana:https://seedlingsol.xyz/api/gift/<familyPda>?amount=20&from=Grandma
// and the wallet hits THIS endpoint twice (GET, then POST). The familyPda
// parameter is what scopes a gift to a specific kid.

import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

import { MAINNET_ADDRESSES, MAINNET_RPC } from "@/lib/program";
import {
  FAMILY_POSITION_DISCRIMINATOR,
  SeedlingQuasarClient,
} from "@/lib/quasar-client";

const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);

// SPL Memo v2. We tag gift names with a fixed prefix so fetchGifts can
// distinguish them from any other memo a future feature might attach.
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
export const GIFT_MEMO_PREFIX = "seedling-gift:";
const MAX_NAME_LEN = 32;

// Sanitize the gifter-provided name. Cap at MAX_NAME_LEN, strip ASCII
// control chars (0x00-0x1F) + DEL (0x7F), keep printable Unicode.
// The memo lives on-chain forever — we filter out non-printable junk.
function sanitizeName(raw: string): string {
  const cleaned = Array.from(raw)
    .filter((c) => {
      const cp = c.codePointAt(0) ?? 0;
      return cp >= 0x20 && cp !== 0x7f;
    })
    .join("")
    .trim();
  return cleaned.slice(0, MAX_NAME_LEN);
}

function buildMemoIx(payload: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(payload, "utf-8"),
  });
}

// No stub wallet needed under Quasar — instruction builders don't need
// a signer/provider, and account fetching uses the codec directly.

// ----- GET: wallet metadata -----
export async function GET() {
  return NextResponse.json({
    label: "Seedling — gift to a family",
    icon: "https://seedlingsol.xyz/icon.png",
  });
}

// ----- POST: build the gift transaction -----
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ familyPda: string }> }
) {
  try {
    const { familyPda: familyPdaStr } = await ctx.params;
    const url = new URL(req.url);
    const amountUsdRaw = url.searchParams.get("amount") ?? "10";
    const amountUsd = Number(amountUsdRaw);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0 || amountUsd > 1000) {
      return NextResponse.json(
        { error: "amount must be between 0 and 1000" },
        { status: 400 }
      );
    }

    const fromRaw = url.searchParams.get("from") ?? "";
    const fromName = sanitizeName(fromRaw);

    const body = (await req.json()) as { account?: string };
    if (!body.account) {
      return NextResponse.json({ error: "missing account" }, { status: 400 });
    }
    const depositor = new PublicKey(body.account);
    const familyPda = new PublicKey(familyPdaStr);

    // Verify the family exists. Quasar accounts have a 1-byte
    // discriminator at offset 0 = FAMILY_POSITION_DISCRIMINATOR (=2).
    const connection = new Connection(MAINNET_RPC, "confirmed");
    const familyInfo = await connection.getAccountInfo(familyPda, "confirmed");
    if (
      !familyInfo ||
      familyInfo.data[0] !== FAMILY_POSITION_DISCRIMINATOR[0]
    ) {
      return NextResponse.json({ error: "family not found" }, { status: 404 });
    }

    const client = new SeedlingQuasarClient();
    const amountBaseUnits = Math.round(amountUsd * 1_000_000);

    const depositorUsdcAta = getAssociatedTokenAddressSync(
      MAINNET_ADDRESSES.usdcMint,
      depositor
    );
    const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("lma"), MAINNET_ADDRESSES.kaminoMarket.toBuffer()],
      MAINNET_ADDRESSES.klendProgram
    );

    // Idempotent — no-ops when the gifter has touched USDC before.
    const ataIx = createAssociatedTokenAccountIdempotentInstruction(
      depositor,
      depositorUsdcAta,
      depositor,
      MAINNET_ADDRESSES.usdcMint
    );

    // CU budget matches DepositForm. Quasar measured ~85k actual; 800k is
    // generous headroom for harvest fluctuations.
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 });

    const depositIx = client.createDepositInstruction({
      familyPosition: familyPda,
      depositor,
      depositorUsdcAta,
      vaultUsdcAta: MAINNET_ADDRESSES.vaultUsdcAta,
      vaultCtokenAta: MAINNET_ADDRESSES.vaultCtokenAta,
      treasuryUsdcAta: MAINNET_ADDRESSES.treasury,
      vaultConfig: MAINNET_ADDRESSES.vaultConfig,
      usdcMint: MAINNET_ADDRESSES.usdcMint,
      ctokenMint: MAINNET_ADDRESSES.ctokenMint,
      kaminoReserve: MAINNET_ADDRESSES.kaminoReserve,
      lendingMarket: MAINNET_ADDRESSES.kaminoMarket,
      lendingMarketAuthority,
      reserveLiquiditySupply: MAINNET_ADDRESSES.reserveLiquiditySupply,
      oraclePyth: MAINNET_ADDRESSES.oraclePyth,
      oracleSwitchboardPrice: MAINNET_ADDRESSES.klendProgram,
      oracleSwitchboardTwap: MAINNET_ADDRESSES.klendProgram,
      oracleScopeConfig: MAINNET_ADDRESSES.oracleScopeConfig,
      kaminoProgram: MAINNET_ADDRESSES.klendProgram,
      instructionSysvar: SYSVAR_INSTRUCTIONS,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      amount: BigInt(amountBaseUnits),
      minSharesOut: BigInt(0),
    });

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    tx.feePayer = depositor;
    tx.recentBlockhash = blockhash;
    tx.add(cuIx, ataIx);
    // Always tag gift-API txs with the prefix memo — even for anonymous
    // gifts (no name supplied). The wall filters on memo presence to
    // distinguish gifts from plain dashboard top-ups, so the memo must
    // be present unconditionally for the gift to surface.
    tx.add(buildMemoIx(GIFT_MEMO_PREFIX + fromName));
    tx.add(depositIx);

    // Serialize unsigned. The wallet completes signing client-side.
    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return NextResponse.json({
      transaction: serialized.toString("base64"),
      message: fromName
        ? `Gift $${amountUsd} from ${fromName}`
        : `Gift $${amountUsd} to a Seedling family`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
