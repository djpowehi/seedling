// Smoke test for the Quasar TS client — verifies every instruction
// builder compiles, returns a TransactionInstruction with the right
// program ID, the discriminator byte at data[0], the expected account
// count, and the expected total data length.
//
// Run via: `npx tsx lib/__quasar-smoke-test.ts`
//
// Static check only. Uses PublicKey.default() for accounts that don't
// need to be real, so this won't validate on-chain state — it exercises
// the full encoding path and catches any codec/layout drift before UI
// components or scripts hit it.

import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  SeedlingQuasarClient,
  VaultConfigCodec,
  FamilyPositionCodec,
  KidViewCodec,
  VAULT_CONFIG_DISCRIMINATOR,
  FAMILY_POSITION_DISCRIMINATOR,
  KID_VIEW_DISCRIMINATOR,
} from "./quasar-client";
import { familyPositionPda, kidViewPda, vaultConfigPda } from "./quasarPdas";
import { MAINNET_ADDRESSES } from "./program";

const client = new SeedlingQuasarClient();
const parent = Keypair.generate().publicKey;
const kid = Keypair.generate().publicKey;
const authority = Keypair.generate().publicKey;
const depositor = parent;
const keeper = parent;

const vaultConfig = vaultConfigPda();
const familyPosition = familyPositionPda(parent, kid);
const kidView = kidViewPda(parent, kid);

const TOKEN_PROGRAM = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const INSTRUCTION_SYSVAR = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);

let failed = false;
const seenDiscriminators = new Set<number>();

function check(
  name: string,
  expectedDiscriminator: number,
  expectedAccountCount: number,
  expectedDataLen: number,
  ix: import("@solana/web3.js").TransactionInstruction
) {
  const ok = {
    programId:
      ix.programId.toBase58() === SeedlingQuasarClient.programId.toBase58(),
    accountCount: ix.keys.length === expectedAccountCount,
    discriminator: ix.data[0] === expectedDiscriminator,
    dataLen: ix.data.length === expectedDataLen,
    uniqueDisc: !seenDiscriminators.has(expectedDiscriminator),
  };
  seenDiscriminators.add(expectedDiscriminator);
  const passed =
    ok.programId &&
    ok.accountCount &&
    ok.discriminator &&
    ok.dataLen &&
    ok.uniqueDisc;
  console.log(
    `${passed ? "✅" : "❌"} ${name.padEnd(30)}` +
      `  disc=${ix.data[0]}/${expectedDiscriminator}` +
      `  accounts=${ix.keys.length}/${expectedAccountCount}` +
      `  dataLen=${ix.data.length}/${expectedDataLen}` +
      `  unique=${ok.uniqueDisc}`
  );
  if (!passed) failed = true;
}

// Common args blocks
const depositLikeAccounts = {
  vaultUsdcAta: MAINNET_ADDRESSES.vaultUsdcAta,
  vaultCtokenAta: MAINNET_ADDRESSES.vaultCtokenAta,
  treasuryUsdcAta: MAINNET_ADDRESSES.treasury,
  vaultConfig,
  usdcMint: MAINNET_ADDRESSES.usdcMint,
  ctokenMint: MAINNET_ADDRESSES.ctokenMint,
  kaminoReserve: MAINNET_ADDRESSES.kaminoReserve,
  lendingMarket: MAINNET_ADDRESSES.kaminoMarket,
  lendingMarketAuthority: PublicKey.default,
  reserveLiquiditySupply: MAINNET_ADDRESSES.reserveLiquiditySupply,
  oraclePyth: MAINNET_ADDRESSES.oraclePyth,
  oracleSwitchboardPrice: MAINNET_ADDRESSES.klendProgram,
  oracleSwitchboardTwap: MAINNET_ADDRESSES.klendProgram,
  oracleScopeConfig: MAINNET_ADDRESSES.klendProgram,
  kaminoProgram: MAINNET_ADDRESSES.klendProgram,
  instructionSysvar: INSTRUCTION_SYSVAR,
  tokenProgram: TOKEN_PROGRAM,
  systemProgram: SystemProgram.programId,
};

// 0. initializeVault — disc 0, 11 accounts
// args: 4×Pubkey(32) + i64(8) + u16(2) = 138 → data 139
check(
  "initializeVault",
  0,
  11,
  139,
  client.createInitializeVaultInstruction({
    authority,
    vaultConfig,
    usdcMint: MAINNET_ADDRESSES.usdcMint,
    ctokenMint: MAINNET_ADDRESSES.ctokenMint,
    treasuryUsdcAta: MAINNET_ADDRESSES.treasury,
    kaminoReserve: MAINNET_ADDRESSES.kaminoReserve,
    vaultUsdcAta: MAINNET_ADDRESSES.vaultUsdcAta,
    vaultCtokenAta: MAINNET_ADDRESSES.vaultCtokenAta,
    tokenProgram: TOKEN_PROGRAM,
    systemProgram: SystemProgram.programId,
    args: {
      oraclePyth: MAINNET_ADDRESSES.oraclePyth,
      oracleSwitchboardPrice: PublicKey.default,
      oracleSwitchboardTwap: PublicKey.default,
      oracleScopeConfig: PublicKey.default,
      periodEndTs: BigInt(1764547200),
      feeBps: 1000,
    },
  })
);

// 1. createFamily — disc 1, 6 accounts
// args: Pubkey(32) + u64(8) = 40 → data 41
check(
  "createFamily",
  1,
  6,
  41,
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

// 2. deposit — disc 2, 22 accounts (21 user + auto-injected ATA program)
// args: u64(8) + u64(8) = 16 → data 17
check(
  "deposit",
  2,
  22,
  17,
  client.createDepositInstruction({
    familyPosition,
    depositor,
    depositorUsdcAta: PublicKey.default,
    ...depositLikeAccounts,
    amount: BigInt(1_000_000),
    minSharesOut: BigInt(0),
  })
);

// 3. withdraw — disc 3, 22 accounts
// args: u64(8) + u64(8) = 16 → data 17
check(
  "withdraw",
  3,
  22,
  17,
  client.createWithdrawInstruction({
    familyPosition,
    parent,
    parentUsdcAta: PublicKey.default,
    ...depositLikeAccounts,
    sharesToBurn: BigInt(100_000),
    minAssetsOut: BigInt(0),
  })
);

// 4. distributeMonthlyAllowance — disc 4, 23 accounts (21 user + ATA + system)
// no args → data 1
check(
  "distributeMonthlyAllowance",
  4,
  23,
  1,
  client.createDistributeMonthlyAllowanceInstruction({
    keeper,
    familyPosition,
    kidView,
    kidPoolAta: PublicKey.default,
    ...depositLikeAccounts,
  })
);

// 5. distributeBonus — disc 5, 23 accounts
// no args → data 1
check(
  "distributeBonus",
  5,
  23,
  1,
  client.createDistributeBonusInstruction({
    keeper,
    familyPosition,
    kidView,
    kidPoolAta: PublicKey.default,
    ...depositLikeAccounts,
  })
);

// 6. closeFamily — disc 6, 23 accounts
// no args → data 1
check(
  "closeFamily",
  6,
  23,
  1,
  client.createCloseFamilyInstruction({
    familyPosition,
    kidView,
    parent,
    parentUsdcAta: PublicKey.default,
    ...depositLikeAccounts,
  })
);

// 7. setFamilyLastDistribution — disc 7, 3 accounts
// args: i64(8) → data 9
check(
  "setFamilyLastDistribution",
  7,
  3,
  9,
  client.createSetFamilyLastDistributionInstruction({
    vaultConfig,
    familyPosition,
    authority,
    newLastDistribution: BigInt(1764547200),
  })
);

// 8. rollPeriod — disc 8, 2 accounts
// args: i64(8) → data 9
check(
  "rollPeriod",
  8,
  2,
  9,
  client.createRollPeriodInstruction({
    vaultConfig,
    authority,
    nextPeriodEndTs: BigInt(1764547200),
  })
);

// 9. setPaused — disc 9, 2 accounts
// args: bool(1) → data 2
check(
  "setPaused",
  9,
  2,
  2,
  client.createSetPausedInstruction({
    vaultConfig,
    authority,
    paused: true,
  })
);

// 10. payoutKid — disc 10, 8 accounts
// args: u64(8) → data 9
check(
  "payoutKid",
  10,
  8,
  9,
  client.createPayoutKidInstruction({
    feePayer: parent,
    parent,
    familyPosition,
    kidPoolAta: PublicKey.default,
    destinationAta: PublicKey.default,
    vaultConfig,
    usdcMint: MAINNET_ADDRESSES.usdcMint,
    tokenProgram: TOKEN_PROGRAM,
    amount: BigInt(1_000_000),
  })
);

// 11. setStreamRate — disc 11, 4 accounts
// args: u64(8) → data 9
check(
  "setStreamRate",
  11,
  4,
  9,
  client.createSetStreamRateInstruction({
    feePayer: parent,
    parent,
    familyPosition,
    vaultConfig,
    newStreamRate: BigInt(75_000_000),
  })
);

console.log("\nAccount decoder round-trips:");

function roundTrip<T extends Record<string, unknown>>(
  name: string,
  codec: { encode: (v: T) => Uint8Array; decode: (b: Uint8Array) => T },
  disc: Uint8Array,
  decodeFn: (data: Uint8Array) => T,
  fixture: T
) {
  const body = codec.encode(fixture);
  const accountBytes = new Uint8Array(disc.length + body.length);
  accountBytes.set(disc, 0);
  accountBytes.set(body, disc.length);

  let decoded: T;
  try {
    decoded = decodeFn(accountBytes);
  } catch (err) {
    console.log(
      `❌ ${name.padEnd(30)}  decode threw: ${(err as Error).message}`
    );
    failed = true;
    return;
  }

  const mismatches: string[] = [];
  for (const key of Object.keys(fixture)) {
    const original = fixture[key];
    const got = decoded[key];
    const originalStr =
      original instanceof PublicKey ? original.toBase58() : String(original);
    const gotStr = got instanceof PublicKey ? got.toBase58() : String(got);
    if (originalStr !== gotStr) {
      mismatches.push(`${key}: ${originalStr} != ${gotStr}`);
    }
  }

  if (mismatches.length === 0) {
    console.log(
      `✅ ${name.padEnd(30)}  ${
        Object.keys(fixture).length
      } fields round-tripped`
    );
  } else {
    console.log(`❌ ${name.padEnd(30)}  ${mismatches.join("; ")}`);
    failed = true;
  }

  // Discriminator-mismatch path: flipping the disc byte must reject.
  const bad = new Uint8Array(accountBytes);
  bad[0] = (bad[0] + 1) & 0xff;
  try {
    decodeFn(bad);
    console.log(`❌ ${name.padEnd(30)}  accepted wrong discriminator`);
    failed = true;
  } catch {
    /* expected */
  }
}

roundTrip(
  "VaultConfig",
  VaultConfigCodec,
  VAULT_CONFIG_DISCRIMINATOR,
  (d) => client.decodeVaultConfig(d),
  {
    authority,
    treasury: MAINNET_ADDRESSES.treasury,
    feeBps: 1000,
    kaminoReserve: MAINNET_ADDRESSES.kaminoReserve,
    usdcMint: MAINNET_ADDRESSES.usdcMint,
    ctokenMint: MAINNET_ADDRESSES.ctokenMint,
    oraclePyth: MAINNET_ADDRESSES.oraclePyth,
    oracleSwitchboardPrice: PublicKey.default,
    oracleSwitchboardTwap: PublicKey.default,
    oracleScopeConfig: PublicKey.default,
    totalShares: BigInt(123_456_789),
    lastKnownTotalAssets: BigInt(987_654_321),
    periodEndTs: BigInt(1764547200),
    currentPeriodId: 7,
    isPaused: false,
    bump: 254,
  }
);

roundTrip(
  "FamilyPosition",
  FamilyPositionCodec,
  FAMILY_POSITION_DISCRIMINATOR,
  (d) => client.decodeFamilyPosition(d),
  {
    parent,
    kid,
    shares: BigInt(1_000_000),
    principalDeposited: BigInt(50_000_000),
    principalRemaining: BigInt(48_500_000),
    streamRate: BigInt(50_000_000),
    createdAt: BigInt(1714521600),
    lastDistribution: BigInt(1714521600),
    lastBonusPeriodId: 0,
    totalYieldEarned: BigInt(1_234_567),
    bump: 253,
  }
);

roundTrip(
  "KidView",
  KidViewCodec,
  KID_VIEW_DISCRIMINATOR,
  (d) => client.decodeKidView(d),
  {
    familyPosition,
    bump: 252,
  }
);

if (failed) {
  console.log("\n❌ Smoke test FAILED. Quasar TS client is mis-wired.");
  process.exit(1);
}

console.log(
  `\n✅ 12 instructions + 3 account decoders verified. Discriminators 0..11 unique. Program ID ${SeedlingQuasarClient.programId.toBase58()}.`
);
