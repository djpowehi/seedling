// Smoke test for the Quasar TS client — verifies that every instruction
// builder compiles, returns a TransactionInstruction with the right
// program ID, the discriminator byte we expect at the start of `data`,
// and the right account count.
//
// Run via: `npx tsx lib/__quasar-smoke-test.ts`
//
// This is a development aid, not a production test. It uses fake
// addresses (PublicKey.default()) which won't actually validate against
// on-chain state, but it exercises the full encoding path so any codec
// or layout bug surfaces here before we touch UI components.

import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { SeedlingQuasarClient } from "./quasar-client";
import { familyPositionPda, kidViewPda, vaultConfigPda } from "./quasarPdas";
import { DEVNET_ADDRESSES } from "./program";

const client = new SeedlingQuasarClient();
const parent = Keypair.generate().publicKey;
const kid = Keypair.generate().publicKey;
const authority = Keypair.generate().publicKey;
const depositor = parent;

const vaultConfig = vaultConfigPda();
const familyPosition = familyPositionPda(parent, kid);
const kidView = kidViewPda(parent, kid);

function check(
  name: string,
  expectedDiscriminator: number,
  expectedAccountCount: number,
  ix: import("@solana/web3.js").TransactionInstruction
) {
  const ok = {
    programId:
      ix.programId.toBase58() === SeedlingQuasarClient.programId.toBase58(),
    accountCount: ix.keys.length === expectedAccountCount,
    discriminator: ix.data[0] === expectedDiscriminator,
  };
  const passed = ok.programId && ok.accountCount && ok.discriminator;
  console.log(
    `${passed ? "✅" : "❌"} ${name}`,
    `  programId=${ok.programId} accounts=${ix.keys.length}/${expectedAccountCount}=${ok.accountCount} disc[0]=${ix.data[0]}/${expectedDiscriminator}=${ok.discriminator}`
  );
  if (!passed) process.exit(1);
}

// 1. initializeVault — disc 0, 11 accounts
check(
  "initializeVault",
  0,
  11,
  client.createInitializeVaultInstruction({
    authority,
    vaultConfig,
    usdcMint: DEVNET_ADDRESSES.usdcMint,
    ctokenMint: DEVNET_ADDRESSES.ctokenMint,
    treasuryUsdcAta: DEVNET_ADDRESSES.treasury,
    kaminoReserve: DEVNET_ADDRESSES.kaminoReserve,
    vaultUsdcAta: DEVNET_ADDRESSES.vaultUsdcAta,
    vaultCtokenAta: DEVNET_ADDRESSES.vaultCtokenAta,
    tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    systemProgram: SystemProgram.programId,
    args: {
      oraclePyth: DEVNET_ADDRESSES.oraclePyth,
      oracleSwitchboardPrice: PublicKey.default,
      oracleSwitchboardTwap: PublicKey.default,
      oracleScopeConfig: PublicKey.default,
      periodEndTs: BigInt(1764547200),
      feeBps: 1000,
    },
  })
);

// 2. createFamily — disc 1, 6 accounts (added fee_payer for sponsor relay)
check(
  "createFamily",
  1,
  6,
  client.createCreateFamilyInstruction({
    feePayer: parent,
    parent,
    vaultConfig,
    familyPosition,
    kidView,
    systemProgram: SystemProgram.programId,
    kid,
    streamRate: BigInt(50_000_000),
  })
);

// 3. deposit — disc 2, 22 accounts (21 user + 1 auto-injected ATA program)
check(
  "deposit",
  2,
  22,
  client.createDepositInstruction({
    familyPosition,
    depositor,
    depositorUsdcAta: PublicKey.default,
    vaultUsdcAta: DEVNET_ADDRESSES.vaultUsdcAta,
    vaultCtokenAta: DEVNET_ADDRESSES.vaultCtokenAta,
    treasuryUsdcAta: DEVNET_ADDRESSES.treasury,
    vaultConfig,
    usdcMint: DEVNET_ADDRESSES.usdcMint,
    ctokenMint: DEVNET_ADDRESSES.ctokenMint,
    kaminoReserve: DEVNET_ADDRESSES.kaminoReserve,
    lendingMarket: DEVNET_ADDRESSES.kaminoMarket,
    lendingMarketAuthority: PublicKey.default,
    reserveLiquiditySupply: DEVNET_ADDRESSES.reserveLiquiditySupply,
    oraclePyth: DEVNET_ADDRESSES.oraclePyth,
    oracleSwitchboardPrice: DEVNET_ADDRESSES.klendProgram,
    oracleSwitchboardTwap: DEVNET_ADDRESSES.klendProgram,
    oracleScopeConfig: DEVNET_ADDRESSES.klendProgram,
    kaminoProgram: DEVNET_ADDRESSES.klendProgram,
    instructionSysvar: new PublicKey(
      "Sysvar1nstructions1111111111111111111111111"
    ),
    tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    systemProgram: SystemProgram.programId,
    amount: BigInt(1_000_000),
    minSharesOut: BigInt(0),
  })
);

// 4. withdraw — disc 3, 22 accounts
check(
  "withdraw",
  3,
  22,
  client.createWithdrawInstruction({
    familyPosition,
    parent,
    parentUsdcAta: PublicKey.default,
    vaultUsdcAta: DEVNET_ADDRESSES.vaultUsdcAta,
    vaultCtokenAta: DEVNET_ADDRESSES.vaultCtokenAta,
    treasuryUsdcAta: DEVNET_ADDRESSES.treasury,
    vaultConfig,
    usdcMint: DEVNET_ADDRESSES.usdcMint,
    ctokenMint: DEVNET_ADDRESSES.ctokenMint,
    kaminoReserve: DEVNET_ADDRESSES.kaminoReserve,
    lendingMarket: DEVNET_ADDRESSES.kaminoMarket,
    lendingMarketAuthority: PublicKey.default,
    reserveLiquiditySupply: DEVNET_ADDRESSES.reserveLiquiditySupply,
    oraclePyth: DEVNET_ADDRESSES.oraclePyth,
    oracleSwitchboardPrice: DEVNET_ADDRESSES.klendProgram,
    oracleSwitchboardTwap: DEVNET_ADDRESSES.klendProgram,
    oracleScopeConfig: DEVNET_ADDRESSES.klendProgram,
    kaminoProgram: DEVNET_ADDRESSES.klendProgram,
    instructionSysvar: new PublicKey(
      "Sysvar1nstructions1111111111111111111111111"
    ),
    tokenProgram: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"),
    systemProgram: SystemProgram.programId,
    sharesToBurn: BigInt(100_000),
    minAssetsOut: BigInt(0),
  })
);

// 5. setPaused — disc 9, 2 accounts
check(
  "setPaused",
  9,
  2,
  client.createSetPausedInstruction({
    vaultConfig,
    authority,
    paused: true,
  })
);

console.log("\nAll smoke tests passed. Quasar TS client is wired correctly.");
