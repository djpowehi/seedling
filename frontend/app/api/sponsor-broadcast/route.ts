// Sponsor relayer for parent-signed actions (create_family, distribute, etc.).
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
// Anything that doesn't match the allowlist is rejected. The allowlist
// covers parent-signed user actions (create_family, withdraw, distribute
// monthly/bonus, close_family). Deposit is intentionally NOT in the
// allowlist — see ALLOWED_DISCRIMINATORS for why.

import { NextRequest, NextResponse } from "next/server";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { getHotWalletKeypair, getHotWalletPubkey } from "@/lib/hotWallet";
import { DEVNET_RPC, PROGRAM_ID } from "@/lib/program";

// Allowlist of Quasar instructions the relay will sponsor. Anything not
// here gets rejected. Each entry is the 1-byte discriminator (Pinocchio
// program uses single-byte discriminators).
//
//   1  = create_family   (program-level fee_payer change required this)
//   3  = withdraw        (parent signs, no SOL — relay covers gas)
//   4  = distribute_monthly_allowance
//   5  = distribute_bonus
//   6  = close_family
//   10 = payout_kid      (parent-custody v3 — moves USDC from kid_pool
//                         to parent's USDC ATA; destination ownership
//                         enforced program-side)
//   11 = set_stream_rate (parent edits the family's monthly amount)
//
// Deposit (2) deliberately not here — Privy users deposit via Pix only,
// which is server-signed by the hot wallet directly through the 4P
// webhook handler. Letting the client request a deposit relay would
// open a vector for billing the sponsor for arbitrary value transfers.
const ALLOWED_DISCRIMINATORS = new Set<number>([1, 3, 4, 5, 6, 10, 11]);

// Helper-program IDs that can ride along with the Quasar instruction.
// Withdraw bundles ComputeBudget + ATA creation; distribute may bundle
// ComputeBudget; payout_kid bundles ATA + Token transfer. Anything
// outside this set + Quasar program is rejected.
//
// SystemProgram deliberately omitted: none of our flows need a top-level
// SystemProgram instruction (ATA-create CPIs into it internally), and a
// rogue SystemProgram::transfer with sponsor as `from` would let a
// malicious parent siphon SOL from the sponsor wallet.
const ALLOWED_HELPER_PROGRAMS = new Set<string>([
  ComputeBudgetProgram.programId.toBase58(),
  TOKEN_PROGRAM_ID.toBase58(),
  ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
]);

export const dynamic = "force-dynamic";
// Vercel default function timeout is 10s on Hobby. Broadcast itself is
// fast, but `sendRawTransaction` with `skipPreflight: false` simulates
// first which adds a few seconds — give it headroom.
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    return await handle(req);
  } catch (e: unknown) {
    // Catch-all so unhandled throws (env-var loading, keypair decode,
    // tx.partialSign, etc.) return JSON instead of an empty 500 body.
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack ?? "" : "";
    console.error("[sponsor-broadcast] uncaught:", msg, stack);
    return NextResponse.json(
      { error: `relay crashed: ${msg}` },
      { status: 500 }
    );
  }
}

async function handle(req: NextRequest) {
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

  // ---- validation: exactly one instruction targets Quasar; the rest
  // must be helper instructions (ComputeBudget / ATA-create / SystemProgram /
  // SPL-token). This lets withdraw + bundled ATA creation pass the relay.
  const quasarIxs = tx.instructions.filter(
    (i) => i.programId.toBase58() === PROGRAM_ID.toBase58()
  );
  if (quasarIxs.length !== 1) {
    return NextResponse.json(
      { error: `expected 1 Quasar instruction, got ${quasarIxs.length}` },
      { status: 400 }
    );
  }

  const ix = quasarIxs[0];

  if (ix.data.length === 0 || !ALLOWED_DISCRIMINATORS.has(ix.data[0])) {
    return NextResponse.json(
      { error: `discriminator ${ix.data[0]} not in relay allowlist` },
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
  const sponsorB58 = sponsor.toBase58();
  const ataProgramB58 = ASSOCIATED_TOKEN_PROGRAM_ID.toBase58();

  // Every non-Quasar instruction must target a known helper program AND
  // must not reference the sponsor wallet — except as the rent payer
  // (slot 0) of an AssociatedToken create-ATA call.
  //
  // Why: once we add the sponsor signature at message level, it
  // authorizes the sponsor in EVERY instruction that lists them. A
  // rogue Token::transfer with `authority = sponsor` would drain the
  // hot wallet's USDC. Block sponsor from appearing anywhere except
  // the one slot we explicitly need them in.
  for (const helper of tx.instructions) {
    const pid = helper.programId.toBase58();
    if (pid === PROGRAM_ID.toBase58()) continue;
    if (!ALLOWED_HELPER_PROGRAMS.has(pid)) {
      return NextResponse.json(
        { error: `bundled instruction targets non-allowlisted program ${pid}` },
        { status: 400 }
      );
    }
    const isCreateATA = pid === ataProgramB58;
    for (let i = 0; i < helper.keys.length; i++) {
      const meta = helper.keys[i];
      if (meta.pubkey.toBase58() !== sponsorB58) continue;
      // Sponsor is referenced. Only legal slot: createATA payer (index 0).
      if (isCreateATA && i === 0) continue;
      return NextResponse.json(
        {
          error: `helper ${pid} references sponsor wallet at slot ${i} — not allowed`,
        },
        { status: 400 }
      );
    }
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

  // Broadcast only — don't `confirmTransaction` here. Devnet finalization
  // takes 15-30s, which exceeds Vercel's serverless function timeout and
  // returns an empty body to the client (→ "Unexpected end of JSON input"
  // when the client tries `await res.json()`). The client confirms after
  // it receives the signature back.
  let signature: string;
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `broadcast failed: ${msg}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ signature });
}
