// Day 7 Step 1d: Devnet deposit smoke test. Reads program + addresses from
// ~/refs/seedling-devnet-addresses.json. Runs create_family + deposit 1 USDC.
//
// Run: ANCHOR_WALLET=~/.config/solana/id.json \
//      ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
//      npx tsx scripts/devnet-deposit-smoke.ts

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Seedling } from "../target/types/seedling";
import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111",
);
const DEPOSIT_AMOUNT = 1_000_000n;

async function main() {
  const addresses = JSON.parse(
    fs.readFileSync(
      path.join(os.homedir(), "refs", "seedling-devnet-addresses.json"),
      "utf-8",
    ),
  );
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.seedling as Program<Seedling>;
  const authority = (provider.wallet as any).payer as Keypair;

  const KLEND = new PublicKey(addresses.klendProgram);
  const LENDING_MARKET = new PublicKey(addresses.kaminoMarket);
  const [LENDING_MARKET_AUTH] = PublicKey.findProgramAddressSync(
    [Buffer.from("lma"), LENDING_MARKET.toBuffer()],
    KLEND,
  );
  const USDC_MINT = new PublicKey(addresses.usdcMint);
  const CTOKEN_MINT = new PublicKey(addresses.ctokenMint);

  // Fetch reserve's liquidity_supply pubkey dynamically from chain (devnet
  // reserve has a different supply_vault than mainnet).
  const reserveInfo = await provider.connection.getAccountInfo(
    new PublicKey(addresses.kaminoReserve),
  );
  if (!reserveInfo) throw new Error("reserve not on devnet");
  // ReserveLiquidity starts at offset 128; supply_vault is at offset
  // 128 + 32 (mint_pubkey) = 160
  const RESERVE_LIQ_SUPPLY = new PublicKey(reserveInfo.data.slice(160, 192));
  console.log(`Reserve liquidity_supply: ${RESERVE_LIQ_SUPPLY.toBase58()}`);

  // Fresh family per smoke run
  const kid = Keypair.generate();
  const [familyPda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("family"),
      provider.wallet.publicKey.toBuffer(),
      kid.publicKey.toBuffer(),
    ],
    program.programId,
  );

  console.log(`\nCreating family for kid=${kid.publicKey.toBase58()}...`);
  await program.methods
    .createFamily(kid.publicKey, new BN(50_000_000))
    .accounts({
      parent: provider.wallet.publicKey,
      vaultConfig: new PublicKey(addresses.vaultConfig),
    })
    .rpc();

  const parentUsdcAta = getAssociatedTokenAddressSync(
    USDC_MINT,
    provider.wallet.publicKey,
  );
  console.log(
    `Parent USDC balance: ${(await getAccount(provider.connection, parentUsdcAta)).amount}`,
  );

  console.log(
    `\nDeposit ${Number(DEPOSIT_AMOUNT) / 1e6} USDC through Seedling...`,
  );
  const tx = await program.methods
    .deposit(new BN(DEPOSIT_AMOUNT.toString()), new BN(0))
    .accountsPartial({
      familyPosition: familyPda,
      parent: provider.wallet.publicKey,
      parentUsdcAta,
      vaultUsdcAta: new PublicKey(addresses.vaultUsdcAta),
      vaultCtokenAta: new PublicKey(addresses.vaultCtokenAta),
      treasuryUsdcAta: new PublicKey(addresses.treasury),
      vaultConfig: new PublicKey(addresses.vaultConfig),
      usdcMint: USDC_MINT,
      ctokenMint: CTOKEN_MINT,
      kaminoReserve: new PublicKey(addresses.kaminoReserve),
      lendingMarket: LENDING_MARKET,
      lendingMarketAuthority: LENDING_MARKET_AUTH,
      reserveLiquiditySupply: RESERVE_LIQ_SUPPLY,
      // Devnet USDC reserve uses pyth only (per klend-sdk query).
      // KLEND sentinel for unused slots.
      oraclePyth: new PublicKey(
        "Dpw1EAVrSB1ibxiDQyTAW6Zip3J4Btk2x4SgApQCeFbX",
      ),
      oracleSwitchboardPrice: KLEND,
      oracleSwitchboardTwap: KLEND,
      oracleScopeConfig: KLEND,
      kaminoProgram: KLEND,
      instructionSysvar: SYSVAR_INSTRUCTIONS,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
    ])
    .rpc({ commitment: "confirmed" });

  console.log(`\n✓ DEVNET DEPOSIT TX: ${tx}`);
  console.log(`  https://solscan.io/tx/${tx}?cluster=devnet`);

  const family = await program.account.familyPosition.fetch(familyPda);
  console.log(`\n--- family state ---`);
  console.log(`  shares:              ${family.shares.toString()}`);
  console.log(`  principal_deposited: ${family.principalDeposited.toString()}`);
  console.log(`  principal_remaining: ${family.principalRemaining.toString()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
