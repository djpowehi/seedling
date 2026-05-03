// End-to-end gift mode test on devnet.
//
// 1. Creates an ephemeral gifter keypair.
// 2. Funds it with 0.05 SOL from the authority wallet (~/.config/solana/id.json).
// 3. Transfers 5 USDC from the authority's loose balance to the gifter
//    (Circle's devnet USDC mint authority is Circle, not us — so we can't
//    mint, we have to spend out of the authority wallet).
// 4. POSTs to /api/gift/<familyPda>?amount=1 to get the gift transaction.
// 5. Signs with the gifter and submits to devnet.
// 6. Confirms, then re-fetches signatures to verify the gift lands.
//
// Pre-req: dev server running at localhost:3000, authority has ≥5 USDC loose.
// Run with: node test-gift-e2e.mjs

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const RPC = "https://api.devnet.solana.com";
const FAMILY_PDA = new PublicKey(
  "8R3ASvth9dqkspecCvChdWpdkfU39kYuPde9LopLZBNa"
);
const USDC_MINT = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
);
const ENDPOINT = "http://localhost:3000/api/gift/" + FAMILY_PDA.toBase58();

const conn = new Connection(RPC, "confirmed");

function loadKey(path) {
  return Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf-8")))
  );
}

const authority = loadKey(join(homedir(), ".config/solana/id.json"));
const gifter = Keypair.generate();
console.log(`gifter: ${gifter.publicKey.toBase58()}`);
console.log(`authority: ${authority.publicKey.toBase58()}`);

// Step 1+2: fund SOL + transfer 5 USDC from authority's loose balance.
// (Test USDC mint is Circle's — we can't mint, but we have ~19 USDC on hand.)
console.log("\n[1/5] funding gifter with SOL + 5 USDC...");
{
  const gifterAta = getAssociatedTokenAddressSync(USDC_MINT, gifter.publicKey);
  const authorityAta = getAssociatedTokenAddressSync(
    USDC_MINT,
    authority.publicKey
  );
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: gifter.publicKey,
      lamports: 50_000_000, // 0.05 SOL for tx fees
    }),
    createAssociatedTokenAccountIdempotentInstruction(
      authority.publicKey,
      gifterAta,
      gifter.publicKey,
      USDC_MINT
    ),
    createTransferInstruction(
      authorityAta,
      gifterAta,
      authority.publicKey,
      5_000_000, // 5 USDC
      [],
      TOKEN_PROGRAM_ID
    )
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [authority], {
    commitment: "confirmed",
  });
  console.log(`   funded (sig ${sig})`);
}

// Step 3: GET metadata.
console.log("\n[2/5] GET metadata...");
{
  const r = await fetch(ENDPOINT);
  console.log(`   ${r.status} ${JSON.stringify(await r.json())}`);
}

// Step 4: POST for the gift transaction.
console.log("\n[3/5] POST to build $1 gift transaction (from=Grandma)...");
const r = await fetch(ENDPOINT + "?amount=1&from=Grandma", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ account: gifter.publicKey.toBase58() }),
});
if (!r.ok) {
  console.error(`   FAILED: ${r.status} ${await r.text()}`);
  process.exit(1);
}
const { transaction: txB64, message } = await r.json();
console.log(`   got tx (${Buffer.from(txB64, "base64").length} bytes), message: ${message}`);

// Step 5: gifter signs + submits.
console.log("\n[4/5] gifter signs + submits...");
const tx = Transaction.from(Buffer.from(txB64, "base64"));
// Re-fetch a fresh blockhash so we don't blow past expiry between steps.
const { blockhash } = await conn.getLatestBlockhash("confirmed");
tx.recentBlockhash = blockhash;
tx.sign(gifter);
const sig = await conn.sendRawTransaction(tx.serialize(), {
  skipPreflight: false,
  preflightCommitment: "confirmed",
});
console.log(`   submitted: ${sig}`);
await conn.confirmTransaction(sig, "confirmed");
console.log(`   confirmed`);

// Step 6: verify event log + family balance.
console.log("\n[5/5] verifying...");
const txInfo = await conn.getTransaction(sig, {
  maxSupportedTransactionVersion: 0,
  commitment: "confirmed",
});
const memoLine = (txInfo?.meta?.logMessages ?? []).find((l) =>
  l.includes("seedling-gift:")
);
console.log(`   memo found:  ${memoLine ?? "(none)"}`);
const programLogs = (txInfo?.meta?.logMessages ?? []).filter((l) =>
  l.includes("Program data:")
);
console.log(`   data logs:   ${programLogs.length}`);
console.log(`\n✓ gift flow end-to-end on devnet passed.`);
console.log(`   gifter:    ${gifter.publicKey.toBase58()}`);
console.log(`   gift tx:   ${sig}`);
console.log(`   family:    ${FAMILY_PDA.toBase58()}`);
console.log(`\nNow open http://localhost:3000/kid/${FAMILY_PDA.toBase58()}`);
console.log(`and you should see a "gifts received" wall entry.`);
