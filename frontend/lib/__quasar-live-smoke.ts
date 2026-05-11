// Live smoke: fetch real FamilyPosition + KidView accounts from devnet and
// decode them through the Quasar client. Verifies that the codec layouts
// match the bytes the on-chain program writes.
//
// Run from frontend/: `npx tsx lib/__quasar-live-smoke.ts`

import { Connection, PublicKey } from "@solana/web3.js";
import {
  SeedlingQuasarClient,
  FAMILY_POSITION_DISCRIMINATOR,
  KID_VIEW_DISCRIMINATOR,
  FamilyPositionCodec,
  KidViewCodec,
} from "./quasar-client";
import { familyPositionPda, kidViewPda } from "./quasarPdas";

const RPC = "https://api.devnet.solana.com";

async function main() {
  const connection = new Connection(RPC, "confirmed");
  const programId = SeedlingQuasarClient.programId;

  // KidView: disc(1) + family_pubkey(32) + bump(1) = 34 bytes
  const views = await connection.getProgramAccounts(programId, {
    filters: [{ dataSize: 34 }],
  });
  console.log(`KidView candidates: ${views.length}`);
  let viewDecoded = 0;
  let viewFailed = 0;
  const familyPdas: PublicKey[] = [];
  for (const { pubkey, account } of views) {
    if (account.data[0] !== KID_VIEW_DISCRIMINATOR[0]) continue;
    try {
      const kv = KidViewCodec.decode(account.data.subarray(1));
      console.log(
        `  ✅ ${pubkey.toBase58()}  → family=${kv.familyPosition.toBase58()}`
      );
      familyPdas.push(kv.familyPosition);
      viewDecoded++;
    } catch (e) {
      console.log(`  ❌ ${pubkey.toBase58()}  ${(e as Error).message}`);
      viewFailed++;
    }
  }

  // FamilyPosition expected size: disc(1) + parent(32) + kid(32) + 5*u64(40) +
  // 2*i64(16) + u32(4) + u8(1) = 126 bytes. Fetch by KidView's family pointers.
  console.log(
    `\nFamilyPosition direct lookup (${familyPdas.length} addresses from KidViews):`
  );
  let famDecoded = 0;
  let famFailed = 0;
  const infos =
    familyPdas.length > 0
      ? await connection.getMultipleAccountsInfo(familyPdas)
      : [];
  for (let i = 0; i < familyPdas.length; i++) {
    const info = infos[i];
    if (!info) {
      console.log(`  ⚠ ${familyPdas[i].toBase58()}  account missing (closed?)`);
      continue;
    }
    if (info.data[0] !== FAMILY_POSITION_DISCRIMINATOR[0]) {
      console.log(
        `  ❌ ${familyPdas[i].toBase58()}  bad disc[0]=${info.data[0]}`
      );
      famFailed++;
      continue;
    }
    if (info.data.length !== 126) {
      console.log(
        `  ❌ ${familyPdas[i].toBase58()}  data_len=${
          info.data.length
        } (expected 126)`
      );
      famFailed++;
      continue;
    }
    try {
      const fp = FamilyPositionCodec.decode(info.data.subarray(1));
      console.log(
        `  ✅ ${familyPdas[i].toBase58()}  shares=${
          fp.shares
        } principal_remaining=${fp.principalRemaining} stream=${
          fp.streamRate
        }/mo`
      );
      famDecoded++;
    } catch (e) {
      console.log(`  ❌ ${familyPdas[i].toBase58()}  ${(e as Error).message}`);
      famFailed++;
    }
  }

  // PDA derivation cross-check: every live FamilyPosition we decoded
  // should be reproducible by familyPositionPda(parent, kid). Same for
  // KidView. If the seeds in quasarPdas.ts ever drift from the program's
  // on-chain seeds, this catches it.
  console.log("\nPDA derivation cross-check:");
  let pdaFailed = 0;
  let pdaChecked = 0;
  const familyInfos = await connection.getMultipleAccountsInfo(familyPdas);
  for (let i = 0; i < familyPdas.length; i++) {
    const info = familyInfos[i];
    if (!info || info.data.length !== 126) continue;
    const fp = FamilyPositionCodec.decode(info.data.subarray(1));
    const derivedFamily = familyPositionPda(fp.parent, fp.kid);
    const derivedView = kidViewPda(fp.parent, fp.kid);
    const familyMatch = derivedFamily.equals(familyPdas[i]);
    // Find the KidView pubkey that pointed at this family
    const matchingView = views.find(
      (v) =>
        v.account.data[0] === KID_VIEW_DISCRIMINATOR[0] &&
        KidViewCodec.decode(v.account.data.subarray(1)).familyPosition.equals(
          familyPdas[i]
        )
    );
    const viewMatch =
      matchingView != null && derivedView.equals(matchingView.pubkey);
    pdaChecked++;
    if (familyMatch && viewMatch) {
      console.log(
        `  ✅ parent=${fp.parent.toBase58().slice(0, 8)}…/kid=${fp.kid
          .toBase58()
          .slice(0, 8)}…  family+kid_view PDAs reproduce`
      );
    } else {
      console.log(
        `  ❌ parent=${fp.parent.toBase58()} kid=${fp.kid.toBase58()}  familyMatch=${familyMatch} viewMatch=${viewMatch}`
      );
      pdaFailed++;
    }
  }

  console.log(
    `\nSummary: ${viewDecoded} kid views + ${famDecoded} families decoded, ${pdaChecked} PDA derivations verified. ${
      viewFailed + famFailed + pdaFailed
    } failures.`
  );
  if (viewFailed || famFailed || pdaFailed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
