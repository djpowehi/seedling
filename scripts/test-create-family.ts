// End-to-end test: invoke create_family on the deployed Quasar program.
// Decodes the resulting FamilyPosition + KidView and asserts initial state.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import {
  SeedlingQuasarClient,
  FamilyPositionCodec,
  KidViewCodec,
  FAMILY_POSITION_DISCRIMINATOR,
  KID_VIEW_DISCRIMINATOR,
} from "../frontend/lib/quasar-client";

const KEYPAIR_PATH = path.join(os.homedir(), ".config/solana/id.json");
const RPC = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";

async function main() {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8")))
  );
  const connection = new Connection(RPC, "confirmed");
  const client = new SeedlingQuasarClient();
  const programId = SeedlingQuasarClient.programId;

  // Generate a fresh kid pubkey so the test PDA is always new.
  const kid = Keypair.generate().publicKey;
  console.log("Wallet (parent):", wallet.publicKey.toBase58());
  console.log("Kid:            ", kid.toBase58());

  const [vaultConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    programId
  );
  const [familyPosition] = PublicKey.findProgramAddressSync(
    [Buffer.from("family"), wallet.publicKey.toBuffer(), kid.toBuffer()],
    programId
  );
  const [kidView] = PublicKey.findProgramAddressSync(
    [Buffer.from("kid"), wallet.publicKey.toBuffer(), kid.toBuffer()],
    programId
  );
  console.log("family_position:", familyPosition.toBase58());
  console.log("kid_view:       ", kidView.toBase58());

  const streamRate = BigInt(50_000_000); // $50/mo

  const ix = client.createCreateFamilyInstruction({
    parent: wallet.publicKey,
    vaultConfig,
    familyPosition,
    kidView,
    systemProgram: SystemProgram.programId,
    kid,
    streamRate,
  });

  const tx = new Transaction().add(ix);
  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.sign(wallet);

  console.log("\nSending create_family...");
  const sig = await connection.sendRawTransaction(tx.serialize());
  console.log(`tx: ${sig}`);
  console.log(
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`
  );
  await connection.confirmTransaction(sig, "confirmed");
  console.log("✅ confirmed");

  // Verify FamilyPosition.
  console.log("\nReading family_position...");
  const fpInfo = await connection.getAccountInfo(familyPosition);
  if (!fpInfo) throw new Error("family_position not found");
  if (fpInfo.data[0] !== FAMILY_POSITION_DISCRIMINATOR[0]) {
    throw new Error(`bad disc: ${fpInfo.data[0]}`);
  }
  const fp = FamilyPositionCodec.decode(fpInfo.data.subarray(1));
  console.log("FamilyPosition:");
  console.log(`  parent:                ${fp.parent.toBase58()}`);
  console.log(`  kid:                   ${fp.kid.toBase58()}`);
  console.log(`  shares:                ${fp.shares}`);
  console.log(`  principal_deposited:   ${fp.principalDeposited}`);
  console.log(`  principal_remaining:   ${fp.principalRemaining}`);
  console.log(`  stream_rate:           ${fp.streamRate}`);
  console.log(`  created_at:            ${fp.createdAt}`);
  console.log(`  last_distribution:     ${fp.lastDistribution}`);
  console.log(`  last_bonus_period_id:  ${fp.lastBonusPeriodId}`);
  console.log(`  total_yield_earned:    ${fp.totalYieldEarned}`);
  console.log(`  bump:                  ${fp.bump}`);

  // Verify KidView.
  console.log("\nReading kid_view...");
  const kvInfo = await connection.getAccountInfo(kidView);
  if (!kvInfo) throw new Error("kid_view not found");
  if (kvInfo.data[0] !== KID_VIEW_DISCRIMINATOR[0]) {
    throw new Error(`bad disc: ${kvInfo.data[0]}`);
  }
  const kv = KidViewCodec.decode(kvInfo.data.subarray(1));
  console.log("KidView:");
  console.log(`  family_position:       ${kv.familyPosition.toBase58()}`);
  console.log(`  bump:                  ${kv.bump}`);

  // Assertions
  const errors: string[] = [];
  if (fp.parent.toBase58() !== wallet.publicKey.toBase58())
    errors.push("parent mismatch");
  if (fp.kid.toBase58() !== kid.toBase58()) errors.push("kid mismatch");
  if (fp.shares !== 0n) errors.push("shares should be 0");
  if (fp.principalDeposited !== 0n) errors.push("principal_deposited should be 0");
  if (fp.streamRate !== streamRate) errors.push("stream_rate mismatch");
  // Day-3 lock: last_distribution = created_at to prevent day-1 drain attack.
  if (fp.lastDistribution !== fp.createdAt)
    errors.push("last_distribution should equal created_at");
  if (kv.familyPosition.toBase58() !== familyPosition.toBase58())
    errors.push("kid_view.family_position mismatch");

  if (errors.length === 0) {
    console.log("\n✅ All assertions passed. create_family works end-to-end.");
  } else {
    console.log("\n❌ Mismatches:");
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }

  // Print the test family info so subsequent deposit/withdraw tests can use it.
  console.log("\n📋 For follow-up tests:");
  console.log(`  PARENT=${wallet.publicKey.toBase58()}`);
  console.log(`  KID=${kid.toBase58()}`);
  console.log(`  FAMILY_POSITION=${familyPosition.toBase58()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
