// Day 7 Step 1c: One-time initialize_vault on devnet.
// Writes deployment addresses to ~/refs/seedling-devnet-addresses.json.
//
// Run once. Idempotent: refuses to re-init if vault_config already exists.
//
// ANCHOR_WALLET=~/.config/solana/id.json \
// ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
// npx tsx scripts/deploy-init-devnet.ts

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Seedling } from "../target/types/seedling";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Kamino devnet from Day-1 research (master doc §20)
const KLEND = new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
const DEVNET_MARKET = new PublicKey(
  "6aaNTBEmwdN19AAdTwbNrWyUo6iEyiLguxCTePEzSqoH",
);
const DEVNET_USDC_RESERVE = new PublicKey(
  "HRwMj8uuoGVWCanKzKvpTWN5ZvXjtjKGxcFbn2qTPKMW",
);
const DEVNET_USDC = new PublicKey(
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);
// cUSDC mint for this specific reserve (from Day-1 scratch test)
const DEVNET_CTOKEN_MINT = new PublicKey(
  "6FY2rwh5wWrtSveAG9t9ANc2YsrChNasVSEpMQubJcXd",
);

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.seedling as Program<Seedling>;
  const wallet = provider.wallet;
  const authority = (wallet as any).payer as Keypair;

  console.log(`Program:  ${program.programId.toBase58()}`);
  console.log(`Wallet:   ${wallet.publicKey.toBase58()}`);
  console.log(
    `Balance:  ${(await provider.connection.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL} SOL`,
  );

  const [vaultConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    program.programId,
  );

  // Idempotent: skip if already initialized.
  try {
    const cfg = await program.account.vaultConfig.fetch(vaultConfigPda);
    console.log(`\n⚠ Vault already initialized.`);
    console.log(`  authority:    ${cfg.authority.toBase58()}`);
    console.log(`  treasury:     ${cfg.treasury.toBase58()}`);
    console.log(`  usdc_mint:    ${cfg.usdcMint.toBase58()}`);
    console.log(`  ctoken_mint:  ${cfg.ctokenMint.toBase58()}`);
    process.exit(0);
  } catch {
    // Expected — proceed with init.
  }

  // Treasury owner: a throwaway pubkey. It never signs — its only role is
  // to be the "owner" field of the treasury ATA. The ATA is created + paid
  // for by `authority` via getOrCreateAssociatedTokenAccount.
  const treasuryOwner = Keypair.generate();
  const treasuryUsdcAta = (
    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      authority,
      DEVNET_USDC,
      treasuryOwner.publicKey,
    )
  ).address;

  const vaultUsdcAta = getAssociatedTokenAddressSync(
    DEVNET_USDC,
    vaultConfigPda,
    true,
  );
  const vaultCtokenAta = getAssociatedTokenAddressSync(
    DEVNET_CTOKEN_MINT,
    vaultConfigPda,
    true,
  );

  // Devnet USDC reserve uses pyth per Day-1 findings (unlike mainnet's Scope-only).
  // Pass Pubkey::default for unused oracles — program treats as "not configured".
  // For devnet, we pass default on all four since this reserve's exact oracle
  // config is best read dynamically; our contract trusts the cached values.
  console.log(`\nInitializing vault on devnet…`);
  const args = {
    oraclePyth: PublicKey.default,
    oracleSwitchboardPrice: PublicKey.default,
    oracleSwitchboardTwap: PublicKey.default,
    oracleScopeConfig: PublicKey.default,
    cycleMonths: 12,
    feeBps: 1000,
  };
  const tx = await program.methods
    .initializeVault(args)
    .accountsPartial({
      authority: wallet.publicKey,
      usdcMint: DEVNET_USDC,
      ctokenMint: DEVNET_CTOKEN_MINT,
      treasuryUsdcAta,
      kaminoReserve: DEVNET_USDC_RESERVE,
      vaultConfig: vaultConfigPda,
      vaultUsdcAta,
      vaultCtokenAta,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  console.log(`  ✓ initialize_vault tx: ${tx}`);

  // Persist addresses to ~/refs for future use (frontend, keeper, etc.)
  const addresses = {
    network: "devnet",
    deployedAt: new Date().toISOString(),
    programId: program.programId.toBase58(),
    vaultConfig: vaultConfigPda.toBase58(),
    authority: wallet.publicKey.toBase58(),
    treasury: treasuryUsdcAta.toBase58(),
    treasuryOwner: treasuryOwner.publicKey.toBase58(),
    vaultUsdcAta: vaultUsdcAta.toBase58(),
    vaultCtokenAta: vaultCtokenAta.toBase58(),
    usdcMint: DEVNET_USDC.toBase58(),
    ctokenMint: DEVNET_CTOKEN_MINT.toBase58(),
    kaminoReserve: DEVNET_USDC_RESERVE.toBase58(),
    kaminoMarket: DEVNET_MARKET.toBase58(),
    klendProgram: KLEND.toBase58(),
    initTxSignature: tx,
  };
  const outPath = path.join(
    os.homedir(),
    "refs",
    "seedling-devnet-addresses.json",
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2) + "\n");
  console.log(`\n✓ Addresses written to ${outPath}`);
  console.log(JSON.stringify(addresses, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
