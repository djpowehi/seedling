// Demo prep — backdate Maria's last_distribution so "Send monthly"
// is clickable in the demo video, then roll the bonus period so
// "Send 13th" also fires.
//
// Both are authority-only admin instructions; the wallet at
// ANCHOR_WALLET must be the same authority that ran initialize_vault.
//
// Run:
//   ANCHOR_WALLET=~/.config/solana/id.json \
//     ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//     npx tsx scripts/demo-prep.ts

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Seedling } from "../target/types/seedling";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const MONTH_SECONDS = 30 * 86_400;

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

  console.log("\nDone. Refresh the dashboard — both buttons should be live.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
