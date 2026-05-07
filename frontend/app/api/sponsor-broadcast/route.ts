// Sponsor relayer for create_family.
//
// Why this exists: parents who sign in via Privy email/Google have no
// SOL on their embedded wallet. Solana requires rent-exempt lamports
// to create the two PDAs (~$0.40) plus the tx fee — a non-starter for
// non-crypto users. Our hot wallet covers it from a small spread we
// keep on Pix on-ramps.
//
// Flow:
//   1. Client builds a create_family tx with fee_payer = our hot wallet
//   2. Client signs as parent (Privy invisible signing, no popup)
//   3. Client POSTs the partial-signed tx here
//   4. We validate strictly:
//        - exactly ONE instruction
//        - targets the Quasar program ID
//        - discriminator byte == 1 (create_family)
//        - first key (fee_payer position) IS our sponsor pubkey
//        - parent's signature is already attached
//   5. We add the hot-wallet signature, broadcast, return the sig
//
// Anything that doesn't match the allowlist is rejected. We only sponsor
// create_family right now — extending to deposit/withdraw later means
// adding their discriminators here, with a per-instruction validation.

import { NextRequest, NextResponse } from "next/server";
import { Connection, Transaction } from "@solana/web3.js";
import { getHotWalletKeypair, getHotWalletPubkey } from "@/lib/hotWallet";
import { DEVNET_RPC, PROGRAM_ID } from "@/lib/program";

const CREATE_FAMILY_DISCRIMINATOR = 1;

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const serializedTx =
    body && typeof body === "object" && "tx" in body
      ? (body as { tx: unknown }).tx
      : null;

  if (typeof serializedTx !== "string") {
    return NextResponse.json(
      { error: "missing 'tx' (base64 string)" },
      { status: 400 }
    );
  }

  let tx: Transaction;
  try {
    tx = Transaction.from(Buffer.from(serializedTx, "base64"));
  } catch {
    return NextResponse.json(
      { error: "tx failed to deserialize" },
      { status: 400 }
    );
  }

  // ---- validation: exactly one instruction targeting Quasar create_family
  if (tx.instructions.length !== 1) {
    return NextResponse.json(
      { error: `expected 1 instruction, got ${tx.instructions.length}` },
      { status: 400 }
    );
  }

  const ix = tx.instructions[0];

  if (ix.programId.toBase58() !== PROGRAM_ID.toBase58()) {
    return NextResponse.json(
      { error: "instruction does not target Quasar program" },
      { status: 400 }
    );
  }

  if (ix.data.length === 0 || ix.data[0] !== CREATE_FAMILY_DISCRIMINATOR) {
    return NextResponse.json(
      { error: "instruction is not create_family" },
      { status: 400 }
    );
  }

  // ---- validation: fee_payer is our sponsor wallet
  const sponsor = getHotWalletPubkey();
  if (!tx.feePayer || tx.feePayer.toBase58() !== sponsor.toBase58()) {
    return NextResponse.json(
      { error: "fee_payer is not the sponsor wallet" },
      { status: 400 }
    );
  }

  // ---- validation: parent's signature already attached
  // Find the parent in the signatures (tx.signatures is parallel to the
  // signer accounts in the message). The sponsor's slot should be empty
  // (we'll fill it). All other signers should already be signed.
  const sponsorSlotEmpty = tx.signatures.some(
    (s) => s.publicKey.toBase58() === sponsor.toBase58() && s.signature === null
  );
  if (!sponsorSlotEmpty) {
    return NextResponse.json(
      { error: "sponsor signature slot is missing or already filled" },
      { status: 400 }
    );
  }

  const otherSignersAttached = tx.signatures
    .filter((s) => s.publicKey.toBase58() !== sponsor.toBase58())
    .every((s) => s.signature !== null);
  if (!otherSignersAttached) {
    return NextResponse.json(
      { error: "parent signature missing — sign the tx client-side first" },
      { status: 400 }
    );
  }

  // ---- sign + broadcast
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const sponsorKp = getHotWalletKeypair();
  tx.partialSign(sponsorKp);

  let signature: string;
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    await connection.confirmTransaction(signature, "confirmed");
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `broadcast failed: ${msg}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ signature });
}
