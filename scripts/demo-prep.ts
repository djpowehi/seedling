// Demo prep — backdate Maria's last_distribution so "Send monthly"
// is clickable in the demo video, then roll the bonus period so
// "Send 13th" also fires.
//
// Optionally seeds a handful of named sample gifts onto every family
// (set SEED_GIFTS=1) so the kid view's "gifts received" wall has
// content during the demo recording.
//
// Both base flows are authority-only admin instructions; the wallet
// at ANCHOR_WALLET must be the same authority that ran initialize_vault.
// Gift seeding additionally needs ≥4 USDC of loose balance on the
// authority wallet (transferred to ephemeral gifters).
//
// Run:
//   ANCHOR_WALLET=~/.config/solana/id.json \
//     ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//     npx tsx scripts/demo-prep.ts
//
//   # Add this on the first prep before recording — but not on retakes:
//   SEED_GIFTS=1 ANCHOR_WALLET=… ANCHOR_PROVIDER_URL=… npx tsx scripts/demo-prep.ts

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Seedling } from "../target/types/seedling";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MONTH_SECONDS = 30 * 86_400;

const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"
);

// Each gifter is a fresh ephemeral keypair so gifts look like they came
// from real, distinct people. Names are intentionally homely. Amounts
// are deliberately small — devnet USDC is finite and we just need
// content on the wall, not a real economy.
const SAMPLE_GIFTS: { name: string; usd: number }[] = [
  { name: "Grandma", usd: 5 },
  { name: "Uncle Tom", usd: 2 },
  { name: "Auntie", usd: 1 },
];

async function main() {
  const addresses = JSON.parse(
    fs.readFileSync(
      path.join(os.homedir(), "refs", "seedling-devnet-addresses.json"),
      "utf-8"
    )
  );
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.seedling as Program<Seedling>;

  const VAULT_CONFIG = new PublicKey(addresses.vaultConfig);
  const authority = provider.wallet.publicKey;

  // Find every FamilyPosition belonging to this parent.
  const FAMILY_DISCRIMINATOR = Buffer.from([
    36, 165, 172, 151, 135, 133, 205, 110,
  ]);
  const FAMILY_SIZE = 133;
  const accounts = await provider.connection.getProgramAccounts(
    program.programId,
    {
      filters: [
        { dataSize: FAMILY_SIZE },
        {
          memcmp: {
            offset: 0,
            bytes: anchor.utils.bytes.bs58.encode(FAMILY_DISCRIMINATOR),
          },
        },
        { memcmp: { offset: 8, bytes: authority.toBase58() } },
      ],
      commitment: "confirmed",
    }
  );

  if (accounts.length === 0) {
    console.error(
      `No families found for ${authority.toBase58()}. Create one first via the dashboard.`
    );
    process.exit(1);
  }

  console.log(`Found ${accounts.length} family/families.\n`);

  // Backdate every family's last_distribution to 31 days ago so
  // "Send monthly" fires immediately on each card.
  const target = Math.floor(Date.now() / 1000) - (MONTH_SECONDS + 86_400);
  for (const { pubkey } of accounts) {
    const fam = await program.account.familyPosition.fetch(pubkey);
    const kid = (fam as { kid: PublicKey }).kid;
    console.log(
      `Backdating last_distribution on ${pubkey.toBase58().slice(0, 8)}… (kid ${kid.toBase58().slice(0, 8)})`
    );
    const sig = await program.methods
      .setFamilyLastDistribution(new BN(target))
      .accountsPartial({
        vaultConfig: VAULT_CONFIG,
        familyPosition: pubkey,
        authority,
      })
      .rpc({ commitment: "confirmed" });
    console.log(`  ✓ ${sig}`);
  }

  // Roll the bonus period to 1 day ago + bump current_period_id so
  // every family's 13th-allowance gate opens. This makes the
  // celebration state ALSO fire on the kid view.
  const periodEnd = Math.floor(Date.now() / 1000) - 86_400;
  console.log(
    `\nRolling vault period: period_end_ts → ${periodEnd} (1 day ago); current_period_id += 1`
  );
  const sig = await program.methods
    .rollPeriod(new BN(periodEnd))
    .accountsPartial({
      vaultConfig: VAULT_CONFIG,
      authority,
    })
    .rpc({ commitment: "confirmed" });
  console.log(`  ✓ ${sig}`);

  // ───── Optional: seed sample named gifts ─────
  if (process.env.SEED_GIFTS === "1") {
    console.log(`\n[gift seed] sending ${SAMPLE_GIFTS.length} sample gifts to each family…`);
    const authoritySigner = (provider.wallet as anchor.Wallet).payer;
    if (!authoritySigner) {
      throw new Error(
        "SEED_GIFTS requires ANCHOR_WALLET to be a Keypair file (not a remote signer)"
      );
    }
    for (const { pubkey: familyPda } of accounts) {
      console.log(`\n  family ${familyPda.toBase58().slice(0, 8)}…`);
      for (const gift of SAMPLE_GIFTS) {
        await sendSampleGift({
          connection: provider.connection,
          program,
          authority: authoritySigner,
          familyPda,
          addresses,
          name: gift.name,
          amountUsd: gift.usd,
        });
      }
    }
  } else {
    console.log(
      `\n[gift seed] skipped (set SEED_GIFTS=1 to populate the kid view's wall)`
    );
  }

  console.log("\nDone. Refresh the dashboard — both buttons should be live.");
}

// Builds + submits a complete gift transaction directly (no API dependency).
// 1. Generate ephemeral gifter keypair.
// 2. Fund SOL + 1 USDC + idempotent gifter ATA from authority (single tx).
// 3. Build the deposit tx with depositor=gifter, prepend memo + ATA + CU ixs.
// 4. Sign with both authority (fee payer is gifter, but authority pays in step 2)
//    and gifter (the deposit signer), submit, confirm.
type DevnetAddresses = {
  vaultConfig: string;
  treasury: string;
  vaultUsdcAta: string;
  vaultCtokenAta: string;
  usdcMint: string;
  ctokenMint: string;
  kaminoReserve: string;
  kaminoMarket: string;
  klendProgram: string;
  reserveLiquiditySupply: string;
  oracles: { pyth: string };
};

async function sendSampleGift(args: {
  connection: Connection;
  program: Program<Seedling>;
  authority: Keypair;
  familyPda: PublicKey;
  addresses: DevnetAddresses;
  name: string;
  amountUsd: number;
}): Promise<void> {
  const {
    connection,
    program,
    authority,
    familyPda,
    addresses,
    name,
    amountUsd,
  } = args;
  const gifter = Keypair.generate();
  const usdcMint = new PublicKey(addresses.usdcMint);
  const gifterUsdcAta = getAssociatedTokenAddressSync(usdcMint, gifter.publicKey);
  const authorityUsdcAta = getAssociatedTokenAddressSync(usdcMint, authority.publicKey);

  // Step 1: fund the gifter (SOL + USDC + ATA).
  const fundTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: gifter.publicKey,
      lamports: 50_000_000, // 0.05 SOL — enough for several txs
    }),
    createAssociatedTokenAccountIdempotentInstruction(
      authority.publicKey,
      gifterUsdcAta,
      gifter.publicKey,
      usdcMint
    ),
    createTransferInstruction(
      authorityUsdcAta,
      gifterUsdcAta,
      authority.publicKey,
      Math.round(amountUsd * 1_000_000),
      [],
      TOKEN_PROGRAM_ID
    )
  );
  await sendAndConfirmTransaction(connection, fundTx, [authority], {
    commitment: "confirmed",
  });

  // Step 2: build + submit the gift tx (gifter signs, gifter pays).
  const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("lma"), new PublicKey(addresses.kaminoMarket).toBuffer()],
    new PublicKey(addresses.klendProgram)
  );
  const memoIx = new TransactionInstruction({
    programId: MEMO_PROGRAM_ID,
    keys: [],
    data: Buffer.from(`seedling-gift:${name}`, "utf-8"),
  });
  const cuIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 });

  const depositIx = await program.methods
    .deposit(new BN(Math.round(amountUsd * 1_000_000)), new BN(0))
    .accountsPartial({
      familyPosition: familyPda,
      depositor: gifter.publicKey,
      depositorUsdcAta: gifterUsdcAta,
      vaultUsdcAta: new PublicKey(addresses.vaultUsdcAta),
      vaultCtokenAta: new PublicKey(addresses.vaultCtokenAta),
      treasuryUsdcAta: new PublicKey(addresses.treasury),
      vaultConfig: new PublicKey(addresses.vaultConfig),
      usdcMint,
      ctokenMint: new PublicKey(addresses.ctokenMint),
      kaminoReserve: new PublicKey(addresses.kaminoReserve),
      lendingMarket: new PublicKey(addresses.kaminoMarket),
      lendingMarketAuthority,
      reserveLiquiditySupply: new PublicKey(addresses.reserveLiquiditySupply),
      oraclePyth: new PublicKey(addresses.oracles.pyth),
      oracleSwitchboardPrice: new PublicKey(addresses.klendProgram),
      oracleSwitchboardTwap: new PublicKey(addresses.klendProgram),
      oracleScopeConfig: new PublicKey(addresses.klendProgram),
      kaminoProgram: new PublicKey(addresses.klendProgram),
      instructionSysvar: SYSVAR_INSTRUCTIONS,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const giftTx = new Transaction().add(cuIx, memoIx, depositIx);
  giftTx.feePayer = gifter.publicKey;
  const sig = await sendAndConfirmTransaction(connection, giftTx, [gifter], {
    commitment: "confirmed",
  });
  console.log(`    ✓ ${name} → $${amountUsd}  (${sig.slice(0, 8)}…)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
