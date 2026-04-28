// Day-4 Surfpool e2e: real Kamino CPI on mainnet-fork.
//
// Prerequisites:
//   - surfpool start --network mainnet --no-tui --no-studio --no-deploy --log-level warn
//   - anchor build && anchor deploy --provider.cluster http://127.0.0.1:8899
//   - mainnet pubkeys at ~/refs/mainnet-kamino-pubkeys.json (from get-mainnet-pubkeys.ts)
//
// Run: npx tsx tests/deposit-surfpool.test.ts
// Not part of `anchor test` because that spins its own validator.

import * as anchor from "@coral-xyz/anchor";
import { BN, Program } from "@coral-xyz/anchor";
import { Seedling } from "../target/types/seedling";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Connection,
  ComputeBudgetProgram,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  createMint,
  getAccount,
} from "@solana/spl-token";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SURFPOOL = "http://127.0.0.1:8899";
const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);

async function main() {
  const pubkeys = JSON.parse(
    fs.readFileSync(
      path.join(os.homedir(), "refs", "mainnet-kamino-pubkeys.json"),
      "utf-8"
    )
  );

  const connection = new Connection(SURFPOOL, "confirmed");
  const wallet = anchor.Wallet.local();
  const provider = new anchor.AnchorProvider(connection, wallet, {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const program = anchor.workspace.seedling as Program<Seedling>;

  console.log(`Program: ${program.programId.toBase58()}`);
  console.log(`Wallet:  ${wallet.publicKey.toBase58()}`);
  console.log(
    `Wallet SOL: ${
      (await connection.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL
    }`
  );

  // Surfpool fork serves real mainnet Kamino accounts via JIT-fetch.
  const KLEND = new PublicKey(pubkeys.klendProgramId);
  const RESERVE = new PublicKey(pubkeys.usdcReserve);
  const LENDING_MARKET = new PublicKey(pubkeys.lendingMarket);
  const USDC_MINT = new PublicKey(pubkeys.usdcMint); // mainnet USDC
  const CTOKEN_MINT = new PublicKey(pubkeys.ctokenMint);
  const RESERVE_LIQ_SUPPLY = new PublicKey(pubkeys.liquiditySupplyVault);
  const SCOPE = new PublicKey(pubkeys.oracles.scopeConfig);

  // Lending market authority is a PDA: [LENDING_MARKET_AUTH, lending_market]
  // with bump in lending_market.bump_seed. We compute by trying common bumps.
  // Klend uses seed b"lma" historically, OR the constant from their program.
  // Easier: read the bump from the lending_market account on Surfpool.
  const lmInfo = await connection.getAccountInfo(LENDING_MARKET);
  if (!lmInfo) throw new Error("lending_market not in fork");
  // LendingMarket layout: discriminator(8) + version(8) + bump_seed(u8 at offset 16)
  const lmBump = lmInfo.data[16];
  // klend PDA: seeds = [b"lma", lending_market.key()]
  const [LENDING_MARKET_AUTH] = PublicKey.findProgramAddressSync(
    [Buffer.from("lma"), LENDING_MARKET.toBuffer()],
    KLEND
  );
  console.log(
    `Lending market authority (computed): ${LENDING_MARKET_AUTH.toBase58()}, bump from market=${lmBump}`
  );

  // ===== State setup =====
  // Use the wallet as authority + parent for the e2e test.
  const authority = (wallet as any).payer as Keypair;

  // If vault is already initialized (persistent Surfpool state), reuse its
  // cached treasury. Otherwise create a fresh one for first-time init.
  const [vaultConfigPdaForTreasury] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    program.programId
  );
  let treasuryUsdcAta: PublicKey;
  try {
    const cfg = await program.account.vaultConfig.fetch(
      vaultConfigPdaForTreasury
    );
    treasuryUsdcAta = cfg.treasury;
    console.log(`Reusing cached treasury: ${treasuryUsdcAta.toBase58()}`);
  } catch {
    const treasuryOwner = Keypair.generate();
    await connection.confirmTransaction(
      await connection.requestAirdrop(
        treasuryOwner.publicKey,
        1 * LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
    treasuryUsdcAta = (
      await getOrCreateAssociatedTokenAccount(
        connection,
        authority,
        USDC_MINT,
        treasuryOwner.publicKey
      )
    ).address;
  }

  // Wallet's USDC ATA — needs USDC. On mainnet-fork, mainnet USDC mint exists
  // but our wallet has 0 balance. Surfpool can override account state via
  // RPC, but easiest: use Surfpool's surfnet-side faucet method if available,
  // OR just create a fresh test mint instead of mainnet USDC.
  //
  // Test plan: use the REAL mainnet USDC. Surfpool exposes `surfnet_setAccount`
  // to inject token balance. Try it.
  const PARENT_USDC_INITIAL = 100_000_000n; // 100 USDC

  const parentUsdcAta = getAssociatedTokenAddressSync(
    USDC_MINT,
    wallet.publicKey
  );

  // Manually create the ATA if it doesn't exist
  try {
    await getAccount(connection, parentUsdcAta);
    console.log("Parent USDC ATA already exists");
  } catch {
    console.log("Creating parent USDC ATA...");
    await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      USDC_MINT,
      wallet.publicKey
    );
  }

  // Inject 100 USDC via Surfpool's surfnet_setTokenAccount (or fallback).
  // Surfpool 1.1.1 RPC: "surfnet_setTokenAccount" mints to an ATA.
  const setTokenResp = await fetch(SURFPOOL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "surfnet_setTokenAccount",
      params: [
        wallet.publicKey.toBase58(),
        USDC_MINT.toBase58(),
        { amount: Number(PARENT_USDC_INITIAL) },
      ],
    }),
  });
  const setTokenJson: any = await setTokenResp.json();
  console.log(
    `surfnet_setTokenAccount response: ${JSON.stringify(setTokenJson).slice(
      0,
      200
    )}`
  );

  const parentUsdcAfterTopup = await getAccount(connection, parentUsdcAta);
  console.log(`Parent USDC balance: ${parentUsdcAfterTopup.amount}`);
  if (parentUsdcAfterTopup.amount < PARENT_USDC_INITIAL) {
    throw new Error(
      `Could not seed parent USDC. Got ${parentUsdcAfterTopup.amount}, expected ${PARENT_USDC_INITIAL}`
    );
  }

  // ===== Initialize vault =====
  const [vaultConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault_config")],
    program.programId
  );
  const vaultUsdcAta = getAssociatedTokenAddressSync(
    USDC_MINT,
    vaultConfigPda,
    true
  );
  const vaultCtokenAta = getAssociatedTokenAddressSync(
    CTOKEN_MINT,
    vaultConfigPda,
    true
  );

  // Skip init if already done (Surfpool persists state across runs)
  let vaultExists = false;
  try {
    await program.account.vaultConfig.fetch(vaultConfigPda);
    vaultExists = true;
    console.log("Vault already initialized; skipping init.");
  } catch {}

  if (!vaultExists) {
    console.log("Initializing vault...");
    const args = {
      oraclePyth: PublicKey.default,
      oracleSwitchboardPrice: PublicKey.default,
      oracleSwitchboardTwap: PublicKey.default,
      oracleScopeConfig: SCOPE,
      cycleMonths: 12,
      feeBps: 1000,
    };
    await program.methods
      .initializeVault(args)
      .accountsPartial({
        authority: wallet.publicKey,
        usdcMint: USDC_MINT,
        ctokenMint: CTOKEN_MINT,
        treasuryUsdcAta,
        kaminoReserve: RESERVE,
        vaultConfig: vaultConfigPda,
        vaultUsdcAta,
        vaultCtokenAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    console.log("Vault initialized.");
  }

  // ===== Create family =====
  const kid = Keypair.generate().publicKey;
  const [familyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("family"), wallet.publicKey.toBuffer(), kid.toBuffer()],
    program.programId
  );

  let familyExists = false;
  try {
    await program.account.familyPosition.fetch(familyPda);
    familyExists = true;
  } catch {}

  if (!familyExists) {
    console.log("Creating family...");
    await program.methods
      .createFamily(kid, new BN(50_000_000))
      .accounts({
        parent: wallet.publicKey,
        vaultConfig: vaultConfigPda,
      })
      .rpc();
  }

  // ===== Deposit 1 USDC — THE moment of truth =====
  const amount = new BN(1_000_000); // 1 USDC
  console.log(
    "\n=== DEPOSIT 1 USDC into mainnet Kamino USDC reserve via Seedling ==="
  );

  const parentUsdcBefore = (await getAccount(connection, parentUsdcAta)).amount;
  let vaultCtokenBefore = 0n;
  try {
    vaultCtokenBefore = (await getAccount(connection, vaultCtokenAta)).amount;
  } catch {}
  console.log(`  parent USDC before:   ${parentUsdcBefore}`);
  console.log(`  vault cTokens before: ${vaultCtokenBefore}`);

  const tx = await program.methods
    .deposit(amount, new BN(0))
    .accountsPartial({
      familyPosition: familyPda,
      parent: wallet.publicKey,
      parentUsdcAta,
      vaultUsdcAta,
      vaultCtokenAta,
      treasuryUsdcAta,
      vaultConfig: vaultConfigPda,
      usdcMint: USDC_MINT,
      ctokenMint: CTOKEN_MINT,
      kaminoReserve: RESERVE,
      lendingMarket: LENDING_MARKET,
      lendingMarketAuthority: LENDING_MARKET_AUTH,
      reserveLiquiditySupply: RESERVE_LIQ_SUPPLY,
      // Anchor's Option<AccountInfo> sentinel for None is the target program ID.
      oraclePyth: KLEND,
      oracleSwitchboardPrice: KLEND,
      oracleSwitchboardTwap: KLEND,
      oracleScopeConfig: SCOPE,
      kaminoProgram: KLEND,
      instructionSysvar: SYSVAR_INSTRUCTIONS,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      // Measured CU for first deposit: 111,067. × 1.3 + harvest_and_fee headroom = 200k.
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    ])
    .rpc({ commitment: "confirmed" });

  console.log(`  ✓ deposit tx: ${tx}`);

  const parentUsdcAfter = (await getAccount(connection, parentUsdcAta)).amount;
  const vaultCtokenAfter = (await getAccount(connection, vaultCtokenAta))
    .amount;
  const family = await program.account.familyPosition.fetch(familyPda);
  const cfg = await program.account.vaultConfig.fetch(vaultConfigPda);

  console.log(`\n--- Post-deposit state ---`);
  console.log(
    `  parent USDC delta:   ${
      parentUsdcBefore - parentUsdcAfter
    } (expected 1000000)`
  );
  console.log(
    `  vault cTokens delta: ${
      vaultCtokenAfter - vaultCtokenBefore
    } (>0 expected)`
  );
  console.log(`  family.shares:       ${family.shares.toString()}`);
  console.log(`  family.principal:    ${family.principalDeposited.toString()}`);
  console.log(`  total_shares:        ${cfg.totalShares.toString()}`);
  console.log(
    `  invariant total_shares == family.shares: ${cfg.totalShares.eq(
      family.shares
    )}`
  );

  if (parentUsdcBefore - parentUsdcAfter !== 1_000_000n) {
    throw new Error("Parent USDC didn't decrease by 1 USDC");
  }
  if (vaultCtokenAfter - vaultCtokenBefore === 0n) {
    throw new Error("Vault didn't receive cTokens");
  }
  if (!cfg.totalShares.eq(family.shares)) {
    throw new Error("Shares invariant violated");
  }

  console.log(
    "\n✅ ALL DEPOSIT ASSERTIONS PASSED — real Kamino CPI works on mainnet-fork"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
