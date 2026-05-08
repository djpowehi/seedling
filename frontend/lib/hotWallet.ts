// Server-only hot wallet helpers. The hot wallet is the receiver_wallet
// we hand to 4P for every Pix on-ramp + gift order. When 4P confirms the
// USDC has landed, the webhook calls signAndSendDeposit() — which
// builds + signs a `deposit` Solana instruction with the hot wallet as
// `depositor`, crediting the right family by parsing the customId.
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
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import bs58 from "bs58";

import { DEVNET_ADDRESSES, DEVNET_RPC } from "./program";
import { SeedlingQuasarClient } from "./quasar-client";
import { kidViewPda, vaultConfigPda } from "./quasarPdas";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);
const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
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
    DEVNET_ADDRESSES.usdcMint,
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
 * `lookback` defaults to 100 — far above any realistic duplicate-arrival
 * window for hackathon volume. The scan is paginated server-side by RPC.
 */
export async function hasProcessedCustomId(
  customId: string,
  opts: { lookback?: number } = {}
): Promise<boolean> {
  const lookback = opts.lookback ?? 100;
  const connection = new Connection(DEVNET_RPC, "confirmed");
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

// ---- main entry: build + sign + send the deposit ix ----

export interface SignAndSendDepositInput {
  familyPda: PublicKey;
  amountBaseUnits: bigint;
  customId: string;
  /** Optional gift attribution. If set, prepends `seedling-gift:<name>` memo
   * so the gift wall picks it up. Falsy = parent top-up, no gift memo. */
  gifterName?: string | null;
  /** Lazy creation hint. When set AND the FamilyPosition account doesn't
   *  exist on-chain yet, the deposit tx prepends a create_family ix so the
   *  family is created and funded atomically. The parent + kid are the PDA
   *  seeds; streamRate is the monthly allowance in USDC base units (6 dec).
   *  Hot wallet pays for both the create_family rent and the deposit. */
  lazyCreate?: {
    parent: PublicKey;
    kid: PublicKey;
    streamRateBaseUnits: bigint;
  };
}

export interface SignAndSendDepositResult {
  signature: string;
  hotWallet: string;
  amountBaseUnits: string;
  customId: string;
}

/**
 * Build, sign, send a deposit instruction crediting `familyPda` with
 * `amountBaseUnits` USDC (6 decimals — 1 USDC = 1_000_000). The hot
 * wallet acts as `depositor` and pays gas. Returns the confirmed
 * signature.
 *
 * Throws on:
 * - missing env / malformed key
 * - failed simulation (program rejection — surfaced raw)
 * - failed confirmation
 *
 * The caller (webhook handler) is responsible for calling
 * hasProcessedCustomId() first and skipping if already processed.
 */
export async function signAndSendDeposit(
  input: SignAndSendDepositInput
): Promise<SignAndSendDepositResult> {
  const connection = new Connection(DEVNET_RPC, "confirmed");
  const hotWallet = getHotWalletKeypair();
  const hotWalletUsdcAta = getHotWalletUsdcAta();

  const client = new SeedlingQuasarClient();

  const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("lma"), DEVNET_ADDRESSES.kaminoMarket.toBuffer()],
    DEVNET_ADDRESSES.klendProgram
  );

  // Idempotent — if 4P already created the ATA when sending us USDC, this
  // is a no-op. Belt-and-suspenders for first-ever credit.
  const ataIx = createAssociatedTokenAccountIdempotentInstruction(
    hotWallet.publicKey,
    hotWalletUsdcAta,
    hotWallet.publicKey,
    DEVNET_ADDRESSES.usdcMint
  );

  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 });

  const customIdMemoIx = buildMemoIx(CUSTOM_ID_MEMO_PREFIX + input.customId);

  const giftMemoIx = input.gifterName
    ? buildMemoIx(GIFT_MEMO_PREFIX + input.gifterName)
    : null;

  // Lazy creation: if the caller passed lazyCreate AND the FamilyPosition
  // account doesn't exist on-chain yet, prepend a create_family ix so the
  // family is born and funded in the same tx. We bump CU because deposit
  // already uses ~600k; create_family adds ~50k more — well under the 1.4M
  // limit set in `cuIx`. Skip when the account exists (a previous deposit
  // already promoted the draft).
  let createFamilyIx: TransactionInstruction | null = null;
  if (input.lazyCreate) {
    const existing = await connection.getAccountInfo(input.familyPda);
    if (!existing) {
      const lc = input.lazyCreate;
      createFamilyIx = client.createCreateFamilyInstruction({
        feePayer: hotWallet.publicKey,
        parent: lc.parent,
        vaultConfig: vaultConfigPda(),
        familyPosition: input.familyPda,
        kidView: kidViewPda(lc.parent, lc.kid),
        systemProgram: SystemProgram.programId,
        kid: lc.kid,
        streamRate: lc.streamRateBaseUnits,
      });
    }
  }

  const depositIx = client.createDepositInstruction({
    familyPosition: input.familyPda,
    depositor: hotWallet.publicKey,
    depositorUsdcAta: hotWalletUsdcAta,
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
    systemProgram: SystemProgram.programId,
    amount: input.amountBaseUnits,
    minSharesOut: BigInt(0),
  });

  const tx = new Transaction();
  tx.feePayer = hotWallet.publicKey;
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.add(cuIx, ataIx, customIdMemoIx);
  if (giftMemoIx) tx.add(giftMemoIx);
  // create_family runs BEFORE deposit so FamilyPosition exists by the time
  // deposit runs. Solana processes instructions sequentially within a tx.
  if (createFamilyIx) tx.add(createFamilyIx);
  tx.add(depositIx);

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
    amountBaseUnits: input.amountBaseUnits.toString(),
    customId: input.customId,
  };
}
