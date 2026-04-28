// Solana Pay transaction-request endpoint for gifts.
//
// GET  → returns { label, icon } (wallet shows this before the user signs)
// POST → receives { account }, returns { transaction: base64, message }
//
// The endpoint mints a real `deposit` transaction with `depositor = account`,
// so anyone with a wallet (grandma, classmate, anonymous gifter) can fund
// any family vault. The depositor signs in their wallet; we never sign.
//
// Solana Pay spec: https://docs.solanapay.com/spec#specification-transaction-request
//
// Why this is its own route: the QR encoded on the kid view is
//   solana:https://seedlingsol.xyz/api/gift/<familyPda>?amount=20
// and the wallet hits THIS endpoint twice (GET, then POST). The familyPda
// parameter is what scopes a gift to a specific kid.

import { AnchorProvider, BN, Idl, Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  type VersionedTransaction,
} from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";

import idl from "@/lib/idl.json";
import { DEVNET_ADDRESSES, DEVNET_RPC } from "@/lib/program";
import type { Seedling } from "@/lib/types";

const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);

// Stub wallet — same pattern as fetchFamilyByPda. We're read-only on the
// server: the route builds the transaction but the depositor signs it
// client-side. Any signing call on this wallet should never fire.
const stubKeypair = Keypair.generate();
const stubWallet = {
  publicKey: stubKeypair.publicKey,
  signTransaction: <T extends Transaction | VersionedTransaction>(
    _tx: T
  ): Promise<T> => {
    throw new Error("server-side stub — should never sign");
  },
  signAllTransactions: <T extends Transaction | VersionedTransaction>(
    _txs: T[]
  ): Promise<T[]> => {
    throw new Error("server-side stub — should never sign");
  },
};

function getProgram(connection: Connection) {
  const provider = new AnchorProvider(connection, stubWallet, {
    commitment: "confirmed",
  });
  return new Program(idl as Idl, provider) as unknown as Program<Seedling>;
}

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

    const body = (await req.json()) as { account?: string };
    if (!body.account) {
      return NextResponse.json({ error: "missing account" }, { status: 400 });
    }
    const depositor = new PublicKey(body.account);
    const familyPda = new PublicKey(familyPdaStr);

    // Verify the family exists (and grab kid pubkey for the wallet message).
    const connection = new Connection(DEVNET_RPC, "confirmed");
    const program = getProgram(connection);
    const family = await program.account.familyPosition
      .fetch(familyPda)
      .catch(() => null);
    if (!family) {
      return NextResponse.json({ error: "family not found" }, { status: 404 });
    }

    const amountBaseUnits = Math.round(amountUsd * 1_000_000);
    const amount = new BN(amountBaseUnits);

    const depositorUsdcAta = getAssociatedTokenAddressSync(
      DEVNET_ADDRESSES.usdcMint,
      depositor
    );
    const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("lma"), DEVNET_ADDRESSES.kaminoMarket.toBuffer()],
      DEVNET_ADDRESSES.klendProgram
    );

    // Idempotent — no-ops when the gifter has touched USDC before.
    const ataIx = createAssociatedTokenAccountIdempotentInstruction(
      depositor,
      depositorUsdcAta,
      depositor,
      DEVNET_ADDRESSES.usdcMint
    );

    // CU budget matches DepositForm. Day-4 measured ~111k actual; 300k is
    // ~3× headroom for harvest fluctuations + future post-Kamino logic.
    const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 });

    const depositIx = await program.methods
      .deposit(amount, new BN(0))
      .accountsPartial({
        familyPosition: familyPda,
        depositor,
        depositorUsdcAta,
        vaultUsdcAta: DEVNET_ADDRESSES.vaultUsdcAta,
        vaultCtokenAta: DEVNET_ADDRESSES.vaultCtokenAta,
        treasuryUsdcAta: DEVNET_ADDRESSES.treasury,
        vaultConfig: DEVNET_ADDRESSES.vaultConfig,
        usdcMint: DEVNET_ADDRESSES.usdcMint,
        ctokenMint: DEVNET_ADDRESSES.ctokenMint,
        kaminoReserve: DEVNET_ADDRESSES.kaminoReserve,
        lendingMarket: DEVNET_ADDRESSES.kaminoMarket,
        lendingMarketAuthority,
        reserveLiquiditySupply: DEVNET_ADDRESSES.reserveLiquiditySupply,
        oraclePyth: DEVNET_ADDRESSES.oraclePyth,
        oracleSwitchboardPrice: DEVNET_ADDRESSES.klendProgram,
        oracleSwitchboardTwap: DEVNET_ADDRESSES.klendProgram,
        oracleScopeConfig: DEVNET_ADDRESSES.klendProgram,
        kaminoProgram: DEVNET_ADDRESSES.klendProgram,
        instructionSysvar: SYSVAR_INSTRUCTIONS,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction();
    tx.feePayer = depositor;
    tx.recentBlockhash = blockhash;
    tx.add(cuIx, ataIx, depositIx);

    // Serialize unsigned. The wallet completes signing client-side.
    const serialized = tx.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return NextResponse.json({
      transaction: serialized.toString("base64"),
      message: `Gift $${amountUsd} to a Seedling family`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
