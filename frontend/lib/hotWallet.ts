// Server-only hot wallet helpers. The hot wallet is the receiver_wallet
// we hand to 4P for every Pix on-ramp + gift order. When 4P confirms the
// USDC has landed, the webhook calls signAndSendUsdcTransfer() — which
// builds + signs an SPL Token transfer from the hot wallet's USDC ATA to
// the parent's USDC ATA. The parent then explicitly chooses when to
// move the funds from their wallet into a kid's vault via the standard
// `+ deposit` flow.
//
// Why this two-layer model (Pix → wallet → vault) instead of one-shot
// (Pix → vault directly):
//   - Symmetry: both Pix and external USDC top-ups now route to the same
//     destination (parent's wallet), matching the "top up account" mental
//     model of every consumer fintech app (Nubank/Wise/Mercado Pago).
//   - Recoverability: a parent who tops up by mistake can withdraw to
//     their bank without ever touching a kid's vault.
//   - Cleaner lazy creation: the family-create logic now lives in ONE
//     place (the deposit form's [create_family + deposit] bundle) rather
//     than being split across the Pix webhook and the deposit form.
//   - Better demo flow: parents see their balance grow after Pix, then
//     deposit to the kid — concrete two-step journey vs. opaque one-shot.
//
// Idempotency lives on-chain: every deposit tx the hot wallet signs
// embeds an SPL Memo `cid:<customId>`. Before processing a webhook we
// scan recent hot-wallet signatures for that memo — if it's there, the
// webhook is a duplicate and we skip.
//
// SECURITY: never log SEEDLING_HOT_WALLET_SECRET_KEY. Never derive a
// string from it that could leak in error messages. Never import this
// file from a client component (the `import "server-only"` guard
// enforces this at build time).

import "server-only";

import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";

import { MAINNET_ADDRESSES, MAINNET_RPC } from "./program";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

// Idempotency memo prefix. Short to save tx bytes; distinct from the
// "seedling-gift:" prefix the gift wall filters on.
const CUSTOM_ID_MEMO_PREFIX = "cid:";

// Gift wall memo prefix — must match GIFT_MEMO_PREFIX in the gift route
// so fetchGifts decodes hot-wallet-paid gifts the same way as
// Solana-Pay gifts.
const GIFT_MEMO_PREFIX = "seedling-gift:";

// Cache the loaded keypair across requests on the same Vercel instance.
// Decoding a base58 secret is cheap but pointless to redo per request;
// the env var doesn't change during a deployment's lifetime.
let cachedKeypair: Keypair | null = null;

export function getHotWalletKeypair(): Keypair {
  if (cachedKeypair) return cachedKeypair;

  const secret = process.env.SEEDLING_HOT_WALLET_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "Missing env SEEDLING_HOT_WALLET_SECRET_KEY. See docs/4p-finance-api.md for setup."
    );
  }
  const decoded = bs58.decode(secret);
  if (decoded.length !== 64) {
    throw new Error(
      `SEEDLING_HOT_WALLET_SECRET_KEY decoded to ${decoded.length} bytes; expected 64`
    );
  }
  cachedKeypair = Keypair.fromSecretKey(decoded);
  return cachedKeypair;
}

export function getHotWalletPubkey(): PublicKey {
  return getHotWalletKeypair().publicKey;
}

export function getHotWalletUsdcAta(): PublicKey {
  return getAssociatedTokenAddressSync(
    MAINNET_ADDRESSES.usdcMint,
    getHotWalletPubkey()
  );
}

function buildMemoIx(payload: string): TransactionInstruction {
  return new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(payload, "utf-8"),
  });
}

// ---- on-chain idempotency check ----

/**
 * Returns true if the hot wallet has already signed a tx tagged with the
 * given customId. Implementation: scan the last `lookback` signatures
 * for the hot wallet pubkey, fetch their parsed bodies, and look for an
 * SPL Memo containing `cid:<customId>`.
 *
 * `lookback` defaults to 25 — one getParsedTransactions chunk = one
 * RPC call per check. Polled every 10s by the Pix form, this stays
 * inside Helius free-tier rate limits. Webhook idempotency check uses
 * lookback=100 once per webhook delivery, where rate is fine.
 */
export async function hasProcessedCustomId(
  customId: string,
  opts: { lookback?: number } = {}
): Promise<boolean> {
  const lookback = opts.lookback ?? 25;
  const connection = new Connection(MAINNET_RPC, "confirmed");
  const hotWallet = getHotWalletPubkey();

  const sigs = await connection.getSignaturesForAddress(hotWallet, {
    limit: lookback,
  });

  if (sigs.length === 0) return false;

  const targetMemo = CUSTOM_ID_MEMO_PREFIX + customId;

  // Walk in chunks. getParsedTransactions accepts an array; we batch to
  // avoid hammering RPC if lookback is large.
  const CHUNK = 25;
  for (let i = 0; i < sigs.length; i += CHUNK) {
    const chunk = sigs.slice(i, i + CHUNK);
    const txs = await connection.getParsedTransactions(
      chunk.map((s) => s.signature),
      { maxSupportedTransactionVersion: 0, commitment: "confirmed" }
    );

    for (const tx of txs) {
      if (!tx) continue;
      const ixs = tx.transaction.message.instructions;
      for (const ix of ixs) {
        // Memo program parsed shape: { program: "spl-memo", parsed: "..." }
        // OR raw if RPC didn't parse: programId match + base64 data
        if ("parsed" in ix && typeof ix.parsed === "string") {
          if (ix.parsed.includes(targetMemo)) return true;
        } else if (
          "programId" in ix &&
          ix.programId.toString() === MEMO_PROGRAM_ID.toString()
        ) {
          // Fallback: raw memo, decode the data
          const data = "data" in ix ? (ix.data as string) : "";
          try {
            const decoded = Buffer.from(data, "base64").toString("utf-8");
            if (decoded.includes(targetMemo)) return true;
          } catch {
            // fall through
          }
        }
      }
    }
  }

  return false;
}

// ---- main entry: build + sign + send the USDC transfer to parent ----

export interface SignAndSendUsdcTransferInput {
  /** Parent wallet that will receive the USDC. Their USDC ATA is
   *  derived; if it doesn't exist yet, an idempotent ATA-create is
   *  prepended (sponsor pays the rent). */
  parent: PublicKey;
  amountBaseUnits: bigint;
  customId: string;
  /** Optional gift attribution. If set, prepends `seedling-gift:<name>`
   *  memo so the gift wall picks it up. Falsy = standard parent top-up. */
  gifterName?: string | null;
}

export interface SignAndSendUsdcTransferResult {
  signature: string;
  hotWallet: string;
  parent: string;
  amountBaseUnits: string;
  customId: string;
}

/**
 * Build, sign, send an SPL Token transfer crediting the parent's USDC
 * ATA with `amountBaseUnits` USDC (6 decimals — 1 USDC = 1_000_000).
 * The hot wallet is the source; the parent is the destination owner.
 *
 * Returns the confirmed signature. Idempotent at the caller layer via
 * the customId memo + hasProcessedCustomId().
 *
 * Replaces the previous signAndSendDeposit() which routed Pix top-ups
 * directly to a kid's family vault. The new model funds the parent's
 * wallet first; the parent then explicitly chooses when to deposit
 * into a kid via the dashboard's `+ deposit` flow. See file header for
 * full rationale.
 *
 * Throws on:
 * - missing env / malformed key
 * - failed simulation (token-program rejection — surfaced raw)
 * - failed confirmation
 *
 * The caller (webhook handler) is responsible for calling
 * hasProcessedCustomId() first and skipping if already processed.
 */
export async function signAndSendUsdcTransfer(
  input: SignAndSendUsdcTransferInput
): Promise<SignAndSendUsdcTransferResult> {
  const connection = new Connection(MAINNET_RPC, "confirmed");
  const hotWallet = getHotWalletKeypair();
  const hotWalletUsdcAta = getHotWalletUsdcAta();
  const parentUsdcAta = getAssociatedTokenAddressSync(
    MAINNET_ADDRESSES.usdcMint,
    input.parent
  );

  // Idempotent ATA-create for both source (hot wallet) and destination
  // (parent). Hot wallet's ATA almost always exists by now; parent's may
  // not if this is their first time receiving USDC. Sponsor pays rent.
  const ataIxHotWallet = createAssociatedTokenAccountIdempotentInstruction(
    hotWallet.publicKey,
    hotWalletUsdcAta,
    hotWallet.publicKey,
    MAINNET_ADDRESSES.usdcMint
  );
  const ataIxParent = createAssociatedTokenAccountIdempotentInstruction(
    hotWallet.publicKey,
    parentUsdcAta,
    input.parent,
    MAINNET_ADDRESSES.usdcMint
  );

  // SPL Token Transfer instruction. Built manually to avoid pulling in
  // the spl-token client transfer helper (cleaner dependency surface).
  // Layout: [3 (transfer discriminator), amount (u64 LE)]
  const transferData = Buffer.alloc(9);
  transferData[0] = 3;
  transferData.writeBigUInt64LE(input.amountBaseUnits, 1);
  const transferIx = new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: hotWalletUsdcAta, isSigner: false, isWritable: true },
      { pubkey: parentUsdcAta, isSigner: false, isWritable: true },
      { pubkey: hotWallet.publicKey, isSigner: true, isWritable: false },
    ],
    data: transferData,
  });

  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 });
  const customIdMemoIx = buildMemoIx(CUSTOM_ID_MEMO_PREFIX + input.customId);
  const giftMemoIx = input.gifterName
    ? buildMemoIx(GIFT_MEMO_PREFIX + input.gifterName)
    : null;

  const tx = new Transaction();
  tx.feePayer = hotWallet.publicKey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.add(cuIx, ataIxHotWallet, ataIxParent, customIdMemoIx);
  if (giftMemoIx) tx.add(giftMemoIx);
  tx.add(transferIx);

  tx.sign(hotWallet);

  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    preflightCommitment: "confirmed",
  });

  await connection.confirmTransaction(
    { signature: sig, blockhash, lastValidBlockHeight },
    "confirmed"
  );

  return {
    signature: sig,
    hotWallet: hotWallet.publicKey.toBase58(),
    parent: input.parent.toBase58(),
    amountBaseUnits: input.amountBaseUnits.toString(),
    customId: input.customId,
  };
}
