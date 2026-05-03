import { Buffer } from "buffer";
import { PublicKey as Address, TransactionInstruction } from "@solana/web3.js";
import {
  fixCodecSize,
  getBooleanCodec,
  getBytesCodec,
  getI64Codec,
  getStructCodec,
  getU16Codec,
  getU32Codec,
  getU64Codec,
  getU8Codec,
  transformCodec,
} from "@solana/codecs";

function getPublicKeyCodec() {
  return transformCodec(
    fixCodecSize(getBytesCodec(), 32),
    (value: Address) => value.toBytes(),
    (bytes) => new Address(bytes)
  );
}

function matchDisc(data: Uint8Array, disc: Uint8Array): boolean {
  if (data.length < disc.length) return false;
  for (let i = 0; i < disc.length; i++) {
    if (data[i] !== disc[i]) return false;
  }
  return true;
}

/* Constants */
export const VAULT_CONFIG_DISCRIMINATOR = new Uint8Array([1]);
export const FAMILY_POSITION_DISCRIMINATOR = new Uint8Array([2]);
export const KID_VIEW_DISCRIMINATOR = new Uint8Array([3]);
export const VAULT_INITIALIZED_DISCRIMINATOR = new Uint8Array([0]);
export const FAMILY_CREATED_DISCRIMINATOR = new Uint8Array([1]);
export const DEPOSITED_DISCRIMINATOR = new Uint8Array([2]);
export const WITHDRAWN_DISCRIMINATOR = new Uint8Array([3]);
export const MONTHLY_ALLOWANCE_DISTRIBUTED_DISCRIMINATOR = new Uint8Array([4]);
export const BONUS_DISTRIBUTED_DISCRIMINATOR = new Uint8Array([5]);
export const FAMILY_CLOSED_DISCRIMINATOR = new Uint8Array([6]);
export const INITIALIZE_VAULT_INSTRUCTION_DISCRIMINATOR = new Uint8Array([0]);
export const CREATE_FAMILY_INSTRUCTION_DISCRIMINATOR = new Uint8Array([1]);
export const DEPOSIT_INSTRUCTION_DISCRIMINATOR = new Uint8Array([2]);
export const WITHDRAW_INSTRUCTION_DISCRIMINATOR = new Uint8Array([3]);
export const DISTRIBUTE_MONTHLY_ALLOWANCE_INSTRUCTION_DISCRIMINATOR =
  new Uint8Array([4]);
export const DISTRIBUTE_BONUS_INSTRUCTION_DISCRIMINATOR = new Uint8Array([5]);
export const CLOSE_FAMILY_INSTRUCTION_DISCRIMINATOR = new Uint8Array([6]);
export const SET_FAMILY_LAST_DISTRIBUTION_INSTRUCTION_DISCRIMINATOR =
  new Uint8Array([7]);
export const ROLL_PERIOD_INSTRUCTION_DISCRIMINATOR = new Uint8Array([8]);
export const SET_PAUSED_INSTRUCTION_DISCRIMINATOR = new Uint8Array([9]);

/* Manually emitted (Quasar codegen bug — composite arg structs aren't
 * auto-generated). Mirrors the InitializeVaultArgs in
 * programs/seedling-quasar/src/instructions/initialize_vault.rs.
 *
 * NOTE: must include `_padding: [u8; 6]` field to match Rust struct
 * layout (Pod-derived structs are #[repr(C)] alignment-1, but the macro
 * may add trailing padding to make total size align to next field). The
 * Rust side doesn't currently have explicit padding on this struct; if
 * tests show mismatch, add `_padding: number[]` here and `pub _padding:
 * [u8; 6]` in Rust.
 */
export interface InitializeVaultArgs {
  oraclePyth: Address;
  oracleSwitchboardPrice: Address;
  oracleSwitchboardTwap: Address;
  oracleScopeConfig: Address;
  periodEndTs: bigint;
  feeBps: number;
}

export const InitializeVaultArgsCodec = getStructCodec([
  ["oraclePyth", getPublicKeyCodec()],
  ["oracleSwitchboardPrice", getPublicKeyCodec()],
  ["oracleSwitchboardTwap", getPublicKeyCodec()],
  ["oracleScopeConfig", getPublicKeyCodec()],
  ["periodEndTs", getI64Codec()],
  ["feeBps", getU16Codec()],
]);

/* Interfaces */
export interface VaultConfig {
  authority: Address;
  treasury: Address;
  feeBps: number;
  kaminoReserve: Address;
  usdcMint: Address;
  ctokenMint: Address;
  oraclePyth: Address;
  oracleSwitchboardPrice: Address;
  oracleSwitchboardTwap: Address;
  oracleScopeConfig: Address;
  totalShares: bigint;
  lastKnownTotalAssets: bigint;
  periodEndTs: bigint;
  currentPeriodId: number;
  isPaused: boolean;
  bump: number;
}

export interface FamilyPosition {
  parent: Address;
  kid: Address;
  shares: bigint;
  principalDeposited: bigint;
  principalRemaining: bigint;
  streamRate: bigint;
  createdAt: bigint;
  lastDistribution: bigint;
  lastBonusPeriodId: number;
  totalYieldEarned: bigint;
  bump: number;
}

export interface KidView {
  familyPosition: Address;
  bump: number;
}

export interface VaultInitialized {
  authority: Address;
  treasury: Address;
  kaminoReserve: Address;
  usdcMint: Address;
  ctokenMint: Address;
  ts: bigint;
}

export interface FamilyCreated {
  family: Address;
  parent: Address;
  kid: Address;
  streamRate: bigint;
  ts: bigint;
}

export interface Deposited {
  family: Address;
  depositor: Address;
  amount: bigint;
  sharesMinted: bigint;
  feeToTreasury: bigint;
  ts: bigint;
}

export interface Withdrawn {
  family: Address;
  parent: Address;
  sharesBurned: bigint;
  assetsOut: bigint;
  principalDrawdown: bigint;
  yieldDrawdown: bigint;
  feeToTreasury: bigint;
  ts: bigint;
}

export interface MonthlyAllowanceDistributed {
  family: Address;
  kid: Address;
  streamRate: bigint;
  principalDrawdown: bigint;
  yieldDrawdown: bigint;
  feeToTreasury: bigint;
  ts: bigint;
}

export interface BonusDistributed {
  family: Address;
  kid: Address;
  amount: bigint;
  feeToTreasury: bigint;
  ts: bigint;
  periodId: bigint;
}

export interface FamilyClosed {
  family: Address;
  parent: Address;
  kid: Address;
  sharesRedeemed: bigint;
  assetsPaidOut: bigint;
  principalReturned: bigint;
  yieldReturned: bigint;
  ts: bigint;
}

export interface InitializeVaultInstructionArgs {
  args: InitializeVaultArgs;
}

export interface CreateFamilyInstructionArgs {
  kid: Address;
  streamRate: bigint;
}

export interface DepositInstructionArgs {
  amount: bigint;
  minSharesOut: bigint;
}

export interface WithdrawInstructionArgs {
  sharesToBurn: bigint;
  minAssetsOut: bigint;
}

export interface SetFamilyLastDistributionInstructionArgs {
  newLastDistribution: bigint;
}

export interface RollPeriodInstructionArgs {
  nextPeriodEndTs: bigint;
}

export interface SetPausedInstructionArgs {
  paused: boolean;
}

export interface InitializeVaultInstructionInput {
  authority: Address;
  vaultConfig: Address;
  usdcMint: Address;
  ctokenMint: Address;
  treasuryUsdcAta: Address;
  kaminoReserve: Address;
  vaultUsdcAta: Address;
  vaultCtokenAta: Address;
  tokenProgram: Address;
  systemProgram: Address;
  args: InitializeVaultArgs;
}

export interface CreateFamilyInstructionInput {
  parent: Address;
  vaultConfig: Address;
  familyPosition: Address;
  kidView: Address;
  systemProgram: Address;
  kid: Address;
  streamRate: bigint;
}

export interface DepositInstructionInput {
  familyPosition: Address;
  depositor: Address;
  depositorUsdcAta: Address;
  vaultUsdcAta: Address;
  vaultCtokenAta: Address;
  treasuryUsdcAta: Address;
  vaultConfig: Address;
  usdcMint: Address;
  ctokenMint: Address;
  kaminoReserve: Address;
  lendingMarket: Address;
  lendingMarketAuthority: Address;
  reserveLiquiditySupply: Address;
  oraclePyth: Address;
  oracleSwitchboardPrice: Address;
  oracleSwitchboardTwap: Address;
  oracleScopeConfig: Address;
  kaminoProgram: Address;
  instructionSysvar: Address;
  tokenProgram: Address;
  systemProgram: Address;
  amount: bigint;
  minSharesOut: bigint;
}

export interface WithdrawInstructionInput {
  familyPosition: Address;
  parent: Address;
  parentUsdcAta: Address;
  vaultUsdcAta: Address;
  vaultCtokenAta: Address;
  treasuryUsdcAta: Address;
  vaultConfig: Address;
  usdcMint: Address;
  ctokenMint: Address;
  kaminoReserve: Address;
  lendingMarket: Address;
  lendingMarketAuthority: Address;
  reserveLiquiditySupply: Address;
  oraclePyth: Address;
  oracleSwitchboardPrice: Address;
  oracleSwitchboardTwap: Address;
  oracleScopeConfig: Address;
  kaminoProgram: Address;
  instructionSysvar: Address;
  tokenProgram: Address;
  systemProgram: Address;
  sharesToBurn: bigint;
  minAssetsOut: bigint;
}

export interface DistributeMonthlyAllowanceInstructionInput {
  keeper: Address;
  familyPosition: Address;
  kidView: Address;
  kidUsdcAta: Address;
  kidOwner: Address;
  vaultUsdcAta: Address;
  vaultCtokenAta: Address;
  treasuryUsdcAta: Address;
  vaultConfig: Address;
  usdcMint: Address;
  ctokenMint: Address;
  kaminoReserve: Address;
  lendingMarket: Address;
  lendingMarketAuthority: Address;
  reserveLiquiditySupply: Address;
  oraclePyth: Address;
  oracleSwitchboardPrice: Address;
  oracleSwitchboardTwap: Address;
  oracleScopeConfig: Address;
  kaminoProgram: Address;
  instructionSysvar: Address;
  tokenProgram: Address;
  systemProgram: Address;
}

export interface DistributeBonusInstructionInput {
  keeper: Address;
  familyPosition: Address;
  kidView: Address;
  kidUsdcAta: Address;
  kidOwner: Address;
  vaultUsdcAta: Address;
  vaultCtokenAta: Address;
  treasuryUsdcAta: Address;
  vaultConfig: Address;
  usdcMint: Address;
  ctokenMint: Address;
  kaminoReserve: Address;
  lendingMarket: Address;
  lendingMarketAuthority: Address;
  reserveLiquiditySupply: Address;
  oraclePyth: Address;
  oracleSwitchboardPrice: Address;
  oracleSwitchboardTwap: Address;
  oracleScopeConfig: Address;
  kaminoProgram: Address;
  instructionSysvar: Address;
  tokenProgram: Address;
  systemProgram: Address;
}

export interface CloseFamilyInstructionInput {
  familyPosition: Address;
  kidView: Address;
  parent: Address;
  parentUsdcAta: Address;
  vaultUsdcAta: Address;
  vaultCtokenAta: Address;
  treasuryUsdcAta: Address;
  vaultConfig: Address;
  usdcMint: Address;
  ctokenMint: Address;
  kaminoReserve: Address;
  lendingMarket: Address;
  lendingMarketAuthority: Address;
  reserveLiquiditySupply: Address;
  oraclePyth: Address;
  oracleSwitchboardPrice: Address;
  oracleSwitchboardTwap: Address;
  oracleScopeConfig: Address;
  kaminoProgram: Address;
  instructionSysvar: Address;
  tokenProgram: Address;
  systemProgram: Address;
}

export interface SetFamilyLastDistributionInstructionInput {
  vaultConfig: Address;
  familyPosition: Address;
  authority: Address;
  newLastDistribution: bigint;
}

export interface RollPeriodInstructionInput {
  vaultConfig: Address;
  authority: Address;
  nextPeriodEndTs: bigint;
}

export interface SetPausedInstructionInput {
  vaultConfig: Address;
  authority: Address;
  paused: boolean;
}

/* Codecs */
export const VaultConfigCodec = getStructCodec([
  ["authority", getPublicKeyCodec()],
  ["treasury", getPublicKeyCodec()],
  ["feeBps", getU16Codec()],
  ["kaminoReserve", getPublicKeyCodec()],
  ["usdcMint", getPublicKeyCodec()],
  ["ctokenMint", getPublicKeyCodec()],
  ["oraclePyth", getPublicKeyCodec()],
  ["oracleSwitchboardPrice", getPublicKeyCodec()],
  ["oracleSwitchboardTwap", getPublicKeyCodec()],
  ["oracleScopeConfig", getPublicKeyCodec()],
  ["totalShares", getU64Codec()],
  ["lastKnownTotalAssets", getU64Codec()],
  ["periodEndTs", getI64Codec()],
  ["currentPeriodId", getU32Codec()],
  ["isPaused", getBooleanCodec()],
  ["bump", getU8Codec()],
]);

export const FamilyPositionCodec = getStructCodec([
  ["parent", getPublicKeyCodec()],
  ["kid", getPublicKeyCodec()],
  ["shares", getU64Codec()],
  ["principalDeposited", getU64Codec()],
  ["principalRemaining", getU64Codec()],
  ["streamRate", getU64Codec()],
  ["createdAt", getI64Codec()],
  ["lastDistribution", getI64Codec()],
  ["lastBonusPeriodId", getU32Codec()],
  ["totalYieldEarned", getU64Codec()],
  ["bump", getU8Codec()],
]);

export const KidViewCodec = getStructCodec([
  ["familyPosition", getPublicKeyCodec()],
  ["bump", getU8Codec()],
]);

export const VaultInitializedCodec = getStructCodec([
  ["authority", getPublicKeyCodec()],
  ["treasury", getPublicKeyCodec()],
  ["kaminoReserve", getPublicKeyCodec()],
  ["usdcMint", getPublicKeyCodec()],
  ["ctokenMint", getPublicKeyCodec()],
  ["ts", getI64Codec()],
]);

export const FamilyCreatedCodec = getStructCodec([
  ["family", getPublicKeyCodec()],
  ["parent", getPublicKeyCodec()],
  ["kid", getPublicKeyCodec()],
  ["streamRate", getU64Codec()],
  ["ts", getI64Codec()],
]);

export const DepositedCodec = getStructCodec([
  ["family", getPublicKeyCodec()],
  ["depositor", getPublicKeyCodec()],
  ["amount", getU64Codec()],
  ["sharesMinted", getU64Codec()],
  ["feeToTreasury", getU64Codec()],
  ["ts", getI64Codec()],
]);

export const WithdrawnCodec = getStructCodec([
  ["family", getPublicKeyCodec()],
  ["parent", getPublicKeyCodec()],
  ["sharesBurned", getU64Codec()],
  ["assetsOut", getU64Codec()],
  ["principalDrawdown", getU64Codec()],
  ["yieldDrawdown", getU64Codec()],
  ["feeToTreasury", getU64Codec()],
  ["ts", getI64Codec()],
]);

export const MonthlyAllowanceDistributedCodec = getStructCodec([
  ["family", getPublicKeyCodec()],
  ["kid", getPublicKeyCodec()],
  ["streamRate", getU64Codec()],
  ["principalDrawdown", getU64Codec()],
  ["yieldDrawdown", getU64Codec()],
  ["feeToTreasury", getU64Codec()],
  ["ts", getI64Codec()],
]);

export const BonusDistributedCodec = getStructCodec([
  ["family", getPublicKeyCodec()],
  ["kid", getPublicKeyCodec()],
  ["amount", getU64Codec()],
  ["feeToTreasury", getU64Codec()],
  ["ts", getI64Codec()],
  ["periodId", getU64Codec()],
]);

export const FamilyClosedCodec = getStructCodec([
  ["family", getPublicKeyCodec()],
  ["parent", getPublicKeyCodec()],
  ["kid", getPublicKeyCodec()],
  ["sharesRedeemed", getU64Codec()],
  ["assetsPaidOut", getU64Codec()],
  ["principalReturned", getU64Codec()],
  ["yieldReturned", getU64Codec()],
  ["ts", getI64Codec()],
]);

/* Enums */
export enum ProgramEvent {
  VaultInitialized = "VaultInitialized",
  FamilyCreated = "FamilyCreated",
  Deposited = "Deposited",
  Withdrawn = "Withdrawn",
  MonthlyAllowanceDistributed = "MonthlyAllowanceDistributed",
  BonusDistributed = "BonusDistributed",
  FamilyClosed = "FamilyClosed",
}

export type DecodedEvent =
  | { type: ProgramEvent.VaultInitialized; data: VaultInitialized }
  | { type: ProgramEvent.FamilyCreated; data: FamilyCreated }
  | { type: ProgramEvent.Deposited; data: Deposited }
  | { type: ProgramEvent.Withdrawn; data: Withdrawn }
  | {
      type: ProgramEvent.MonthlyAllowanceDistributed;
      data: MonthlyAllowanceDistributed;
    }
  | { type: ProgramEvent.BonusDistributed; data: BonusDistributed }
  | { type: ProgramEvent.FamilyClosed; data: FamilyClosed };

export enum ProgramInstruction {
  InitializeVault = "InitializeVault",
  CreateFamily = "CreateFamily",
  Deposit = "Deposit",
  Withdraw = "Withdraw",
  DistributeMonthlyAllowance = "DistributeMonthlyAllowance",
  DistributeBonus = "DistributeBonus",
  CloseFamily = "CloseFamily",
  SetFamilyLastDistribution = "SetFamilyLastDistribution",
  RollPeriod = "RollPeriod",
  SetPaused = "SetPaused",
}

export type DecodedInstruction =
  | {
      type: ProgramInstruction.InitializeVault;
      args: InitializeVaultInstructionArgs;
    }
  | { type: ProgramInstruction.CreateFamily; args: CreateFamilyInstructionArgs }
  | { type: ProgramInstruction.Deposit; args: DepositInstructionArgs }
  | { type: ProgramInstruction.Withdraw; args: WithdrawInstructionArgs }
  | { type: ProgramInstruction.DistributeMonthlyAllowance }
  | { type: ProgramInstruction.DistributeBonus }
  | { type: ProgramInstruction.CloseFamily }
  | {
      type: ProgramInstruction.SetFamilyLastDistribution;
      args: SetFamilyLastDistributionInstructionArgs;
    }
  | { type: ProgramInstruction.RollPeriod; args: RollPeriodInstructionArgs }
  | { type: ProgramInstruction.SetPaused; args: SetPausedInstructionArgs };

/* Client */
export class SeedlingQuasarClient {
  static readonly programId = new Address(
    "44vix4JmG4hdoharDH38R5sc7g5MbFxjvpUpgwNDbTYN"
  );

  decodeVaultConfig(data: Uint8Array): VaultConfig {
    if (!matchDisc(data, VAULT_CONFIG_DISCRIMINATOR))
      throw new Error("Invalid VaultConfig discriminator");
    return VaultConfigCodec.decode(
      data.slice(VAULT_CONFIG_DISCRIMINATOR.length)
    );
  }

  decodeFamilyPosition(data: Uint8Array): FamilyPosition {
    if (!matchDisc(data, FAMILY_POSITION_DISCRIMINATOR))
      throw new Error("Invalid FamilyPosition discriminator");
    return FamilyPositionCodec.decode(
      data.slice(FAMILY_POSITION_DISCRIMINATOR.length)
    );
  }

  decodeKidView(data: Uint8Array): KidView {
    if (!matchDisc(data, KID_VIEW_DISCRIMINATOR))
      throw new Error("Invalid KidView discriminator");
    return KidViewCodec.decode(data.slice(KID_VIEW_DISCRIMINATOR.length));
  }

  decodeEvent(data: Uint8Array): DecodedEvent | null {
    if (matchDisc(data, VAULT_INITIALIZED_DISCRIMINATOR))
      return {
        type: ProgramEvent.VaultInitialized,
        data: VaultInitializedCodec.decode(
          data.slice(VAULT_INITIALIZED_DISCRIMINATOR.length)
        ),
      };
    if (matchDisc(data, FAMILY_CREATED_DISCRIMINATOR))
      return {
        type: ProgramEvent.FamilyCreated,
        data: FamilyCreatedCodec.decode(
          data.slice(FAMILY_CREATED_DISCRIMINATOR.length)
        ),
      };
    if (matchDisc(data, DEPOSITED_DISCRIMINATOR))
      return {
        type: ProgramEvent.Deposited,
        data: DepositedCodec.decode(data.slice(DEPOSITED_DISCRIMINATOR.length)),
      };
    if (matchDisc(data, WITHDRAWN_DISCRIMINATOR))
      return {
        type: ProgramEvent.Withdrawn,
        data: WithdrawnCodec.decode(data.slice(WITHDRAWN_DISCRIMINATOR.length)),
      };
    if (matchDisc(data, MONTHLY_ALLOWANCE_DISTRIBUTED_DISCRIMINATOR))
      return {
        type: ProgramEvent.MonthlyAllowanceDistributed,
        data: MonthlyAllowanceDistributedCodec.decode(
          data.slice(MONTHLY_ALLOWANCE_DISTRIBUTED_DISCRIMINATOR.length)
        ),
      };
    if (matchDisc(data, BONUS_DISTRIBUTED_DISCRIMINATOR))
      return {
        type: ProgramEvent.BonusDistributed,
        data: BonusDistributedCodec.decode(
          data.slice(BONUS_DISTRIBUTED_DISCRIMINATOR.length)
        ),
      };
    if (matchDisc(data, FAMILY_CLOSED_DISCRIMINATOR))
      return {
        type: ProgramEvent.FamilyClosed,
        data: FamilyClosedCodec.decode(
          data.slice(FAMILY_CLOSED_DISCRIMINATOR.length)
        ),
      };
    return null;
  }

  decodeInstruction(data: Uint8Array): DecodedInstruction | null {
    if (matchDisc(data, INITIALIZE_VAULT_INSTRUCTION_DISCRIMINATOR)) {
      const argsCodec = getStructCodec([["args", InitializeVaultArgsCodec]]);
      return {
        type: ProgramInstruction.InitializeVault,
        args: argsCodec.decode(
          data.slice(INITIALIZE_VAULT_INSTRUCTION_DISCRIMINATOR.length)
        ),
      };
    }
    if (matchDisc(data, CREATE_FAMILY_INSTRUCTION_DISCRIMINATOR)) {
      const argsCodec = getStructCodec([
        ["kid", getPublicKeyCodec()],
        ["streamRate", getU64Codec()],
      ]);
      return {
        type: ProgramInstruction.CreateFamily,
        args: argsCodec.decode(
          data.slice(CREATE_FAMILY_INSTRUCTION_DISCRIMINATOR.length)
        ),
      };
    }
    if (matchDisc(data, DEPOSIT_INSTRUCTION_DISCRIMINATOR)) {
      const argsCodec = getStructCodec([
        ["amount", getU64Codec()],
        ["minSharesOut", getU64Codec()],
      ]);
      return {
        type: ProgramInstruction.Deposit,
        args: argsCodec.decode(
          data.slice(DEPOSIT_INSTRUCTION_DISCRIMINATOR.length)
        ),
      };
    }
    if (matchDisc(data, WITHDRAW_INSTRUCTION_DISCRIMINATOR)) {
      const argsCodec = getStructCodec([
        ["sharesToBurn", getU64Codec()],
        ["minAssetsOut", getU64Codec()],
      ]);
      return {
        type: ProgramInstruction.Withdraw,
        args: argsCodec.decode(
          data.slice(WITHDRAW_INSTRUCTION_DISCRIMINATOR.length)
        ),
      };
    }
    if (matchDisc(data, DISTRIBUTE_MONTHLY_ALLOWANCE_INSTRUCTION_DISCRIMINATOR))
      return { type: ProgramInstruction.DistributeMonthlyAllowance };
    if (matchDisc(data, DISTRIBUTE_BONUS_INSTRUCTION_DISCRIMINATOR))
      return { type: ProgramInstruction.DistributeBonus };
    if (matchDisc(data, CLOSE_FAMILY_INSTRUCTION_DISCRIMINATOR))
      return { type: ProgramInstruction.CloseFamily };
    if (
      matchDisc(data, SET_FAMILY_LAST_DISTRIBUTION_INSTRUCTION_DISCRIMINATOR)
    ) {
      const argsCodec = getStructCodec([
        ["newLastDistribution", getI64Codec()],
      ]);
      return {
        type: ProgramInstruction.SetFamilyLastDistribution,
        args: argsCodec.decode(
          data.slice(
            SET_FAMILY_LAST_DISTRIBUTION_INSTRUCTION_DISCRIMINATOR.length
          )
        ),
      };
    }
    if (matchDisc(data, ROLL_PERIOD_INSTRUCTION_DISCRIMINATOR)) {
      const argsCodec = getStructCodec([["nextPeriodEndTs", getI64Codec()]]);
      return {
        type: ProgramInstruction.RollPeriod,
        args: argsCodec.decode(
          data.slice(ROLL_PERIOD_INSTRUCTION_DISCRIMINATOR.length)
        ),
      };
    }
    if (matchDisc(data, SET_PAUSED_INSTRUCTION_DISCRIMINATOR)) {
      const argsCodec = getStructCodec([["paused", getBooleanCodec()]]);
      return {
        type: ProgramInstruction.SetPaused,
        args: argsCodec.decode(
          data.slice(SET_PAUSED_INSTRUCTION_DISCRIMINATOR.length)
        ),
      };
    }
    return null;
  }

  createInitializeVaultInstruction(
    input: InitializeVaultInstructionInput
  ): TransactionInstruction {
    const accountsMap: Record<string, Address> = {};
    accountsMap["associatedTokenProgram"] = new Address(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    );
    const argsCodec = getStructCodec([["args", InitializeVaultArgsCodec]]);
    const data = Buffer.from([0, ...argsCodec.encode({ args: input.args })]);
    return new TransactionInstruction({
      programId: SeedlingQuasarClient.programId,
      keys: [
        { pubkey: input.authority, isSigner: true, isWritable: true },
        { pubkey: input.vaultConfig, isSigner: false, isWritable: true },
        { pubkey: input.usdcMint, isSigner: false, isWritable: false },
        { pubkey: input.ctokenMint, isSigner: false, isWritable: false },
        { pubkey: input.treasuryUsdcAta, isSigner: false, isWritable: false },
        { pubkey: input.kaminoReserve, isSigner: false, isWritable: false },
        { pubkey: input.vaultUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultCtokenAta, isSigner: false, isWritable: true },
        { pubkey: input.tokenProgram, isSigner: false, isWritable: false },
        {
          pubkey: accountsMap["associatedTokenProgram"],
          isSigner: false,
          isWritable: false,
        },
        { pubkey: input.systemProgram, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  createCreateFamilyInstruction(
    input: CreateFamilyInstructionInput
  ): TransactionInstruction {
    const argsCodec = getStructCodec([
      ["kid", getPublicKeyCodec()],
      ["streamRate", getU64Codec()],
    ]);
    const data = Buffer.from([
      1,
      ...argsCodec.encode({ kid: input.kid, streamRate: input.streamRate }),
    ]);
    return new TransactionInstruction({
      programId: SeedlingQuasarClient.programId,
      keys: [
        { pubkey: input.parent, isSigner: true, isWritable: true },
        { pubkey: input.vaultConfig, isSigner: false, isWritable: false },
        { pubkey: input.familyPosition, isSigner: false, isWritable: true },
        { pubkey: input.kidView, isSigner: false, isWritable: true },
        { pubkey: input.systemProgram, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  createDepositInstruction(
    input: DepositInstructionInput
  ): TransactionInstruction {
    const accountsMap: Record<string, Address> = {};
    accountsMap["associatedTokenProgram"] = new Address(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    );
    const argsCodec = getStructCodec([
      ["amount", getU64Codec()],
      ["minSharesOut", getU64Codec()],
    ]);
    const data = Buffer.from([
      2,
      ...argsCodec.encode({
        amount: input.amount,
        minSharesOut: input.minSharesOut,
      }),
    ]);
    return new TransactionInstruction({
      programId: SeedlingQuasarClient.programId,
      keys: [
        { pubkey: input.familyPosition, isSigner: false, isWritable: true },
        { pubkey: input.depositor, isSigner: true, isWritable: true },
        { pubkey: input.depositorUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultCtokenAta, isSigner: false, isWritable: true },
        { pubkey: input.treasuryUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultConfig, isSigner: false, isWritable: true },
        { pubkey: input.usdcMint, isSigner: false, isWritable: false },
        { pubkey: input.ctokenMint, isSigner: false, isWritable: true },
        { pubkey: input.kaminoReserve, isSigner: false, isWritable: true },
        { pubkey: input.lendingMarket, isSigner: false, isWritable: false },
        {
          pubkey: input.lendingMarketAuthority,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: input.reserveLiquiditySupply,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: input.oraclePyth, isSigner: false, isWritable: false },
        {
          pubkey: input.oracleSwitchboardPrice,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: input.oracleSwitchboardTwap,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: input.oracleScopeConfig, isSigner: false, isWritable: false },
        { pubkey: input.kaminoProgram, isSigner: false, isWritable: false },
        { pubkey: input.instructionSysvar, isSigner: false, isWritable: false },
        { pubkey: input.tokenProgram, isSigner: false, isWritable: false },
        {
          pubkey: accountsMap["associatedTokenProgram"],
          isSigner: false,
          isWritable: false,
        },
        { pubkey: input.systemProgram, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  createWithdrawInstruction(
    input: WithdrawInstructionInput
  ): TransactionInstruction {
    const accountsMap: Record<string, Address> = {};
    accountsMap["associatedTokenProgram"] = new Address(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    );
    const argsCodec = getStructCodec([
      ["sharesToBurn", getU64Codec()],
      ["minAssetsOut", getU64Codec()],
    ]);
    const data = Buffer.from([
      3,
      ...argsCodec.encode({
        sharesToBurn: input.sharesToBurn,
        minAssetsOut: input.minAssetsOut,
      }),
    ]);
    return new TransactionInstruction({
      programId: SeedlingQuasarClient.programId,
      keys: [
        { pubkey: input.familyPosition, isSigner: false, isWritable: true },
        { pubkey: input.parent, isSigner: true, isWritable: true },
        { pubkey: input.parentUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultCtokenAta, isSigner: false, isWritable: true },
        { pubkey: input.treasuryUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultConfig, isSigner: false, isWritable: true },
        { pubkey: input.usdcMint, isSigner: false, isWritable: false },
        { pubkey: input.ctokenMint, isSigner: false, isWritable: true },
        { pubkey: input.kaminoReserve, isSigner: false, isWritable: true },
        { pubkey: input.lendingMarket, isSigner: false, isWritable: false },
        {
          pubkey: input.lendingMarketAuthority,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: input.reserveLiquiditySupply,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: input.oraclePyth, isSigner: false, isWritable: false },
        {
          pubkey: input.oracleSwitchboardPrice,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: input.oracleSwitchboardTwap,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: input.oracleScopeConfig, isSigner: false, isWritable: false },
        { pubkey: input.kaminoProgram, isSigner: false, isWritable: false },
        { pubkey: input.instructionSysvar, isSigner: false, isWritable: false },
        { pubkey: input.tokenProgram, isSigner: false, isWritable: false },
        {
          pubkey: accountsMap["associatedTokenProgram"],
          isSigner: false,
          isWritable: false,
        },
        { pubkey: input.systemProgram, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  createDistributeMonthlyAllowanceInstruction(
    input: DistributeMonthlyAllowanceInstructionInput
  ): TransactionInstruction {
    const accountsMap: Record<string, Address> = {};
    accountsMap["associatedTokenProgram"] = new Address(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    );
    const data = Buffer.from([4]);
    return new TransactionInstruction({
      programId: SeedlingQuasarClient.programId,
      keys: [
        { pubkey: input.keeper, isSigner: true, isWritable: true },
        { pubkey: input.familyPosition, isSigner: false, isWritable: true },
        { pubkey: input.kidView, isSigner: false, isWritable: false },
        { pubkey: input.kidUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.kidOwner, isSigner: false, isWritable: false },
        { pubkey: input.vaultUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultCtokenAta, isSigner: false, isWritable: true },
        { pubkey: input.treasuryUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultConfig, isSigner: false, isWritable: true },
        { pubkey: input.usdcMint, isSigner: false, isWritable: false },
        { pubkey: input.ctokenMint, isSigner: false, isWritable: true },
        { pubkey: input.kaminoReserve, isSigner: false, isWritable: true },
        { pubkey: input.lendingMarket, isSigner: false, isWritable: false },
        {
          pubkey: input.lendingMarketAuthority,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: input.reserveLiquiditySupply,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: input.oraclePyth, isSigner: false, isWritable: false },
        {
          pubkey: input.oracleSwitchboardPrice,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: input.oracleSwitchboardTwap,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: input.oracleScopeConfig, isSigner: false, isWritable: false },
        { pubkey: input.kaminoProgram, isSigner: false, isWritable: false },
        { pubkey: input.instructionSysvar, isSigner: false, isWritable: false },
        { pubkey: input.tokenProgram, isSigner: false, isWritable: false },
        {
          pubkey: accountsMap["associatedTokenProgram"],
          isSigner: false,
          isWritable: false,
        },
        { pubkey: input.systemProgram, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  createDistributeBonusInstruction(
    input: DistributeBonusInstructionInput
  ): TransactionInstruction {
    const accountsMap: Record<string, Address> = {};
    accountsMap["associatedTokenProgram"] = new Address(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    );
    const data = Buffer.from([5]);
    return new TransactionInstruction({
      programId: SeedlingQuasarClient.programId,
      keys: [
        { pubkey: input.keeper, isSigner: true, isWritable: true },
        { pubkey: input.familyPosition, isSigner: false, isWritable: true },
        { pubkey: input.kidView, isSigner: false, isWritable: false },
        { pubkey: input.kidUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.kidOwner, isSigner: false, isWritable: false },
        { pubkey: input.vaultUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultCtokenAta, isSigner: false, isWritable: true },
        { pubkey: input.treasuryUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultConfig, isSigner: false, isWritable: true },
        { pubkey: input.usdcMint, isSigner: false, isWritable: false },
        { pubkey: input.ctokenMint, isSigner: false, isWritable: true },
        { pubkey: input.kaminoReserve, isSigner: false, isWritable: true },
        { pubkey: input.lendingMarket, isSigner: false, isWritable: false },
        {
          pubkey: input.lendingMarketAuthority,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: input.reserveLiquiditySupply,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: input.oraclePyth, isSigner: false, isWritable: false },
        {
          pubkey: input.oracleSwitchboardPrice,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: input.oracleSwitchboardTwap,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: input.oracleScopeConfig, isSigner: false, isWritable: false },
        { pubkey: input.kaminoProgram, isSigner: false, isWritable: false },
        { pubkey: input.instructionSysvar, isSigner: false, isWritable: false },
        { pubkey: input.tokenProgram, isSigner: false, isWritable: false },
        {
          pubkey: accountsMap["associatedTokenProgram"],
          isSigner: false,
          isWritable: false,
        },
        { pubkey: input.systemProgram, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  createCloseFamilyInstruction(
    input: CloseFamilyInstructionInput
  ): TransactionInstruction {
    const accountsMap: Record<string, Address> = {};
    accountsMap["associatedTokenProgram"] = new Address(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
    );
    const data = Buffer.from([6]);
    return new TransactionInstruction({
      programId: SeedlingQuasarClient.programId,
      keys: [
        { pubkey: input.familyPosition, isSigner: false, isWritable: true },
        { pubkey: input.kidView, isSigner: false, isWritable: true },
        { pubkey: input.parent, isSigner: true, isWritable: true },
        { pubkey: input.parentUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultCtokenAta, isSigner: false, isWritable: true },
        { pubkey: input.treasuryUsdcAta, isSigner: false, isWritable: true },
        { pubkey: input.vaultConfig, isSigner: false, isWritable: true },
        { pubkey: input.usdcMint, isSigner: false, isWritable: false },
        { pubkey: input.ctokenMint, isSigner: false, isWritable: true },
        { pubkey: input.kaminoReserve, isSigner: false, isWritable: true },
        { pubkey: input.lendingMarket, isSigner: false, isWritable: false },
        {
          pubkey: input.lendingMarketAuthority,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: input.reserveLiquiditySupply,
          isSigner: false,
          isWritable: true,
        },
        { pubkey: input.oraclePyth, isSigner: false, isWritable: false },
        {
          pubkey: input.oracleSwitchboardPrice,
          isSigner: false,
          isWritable: false,
        },
        {
          pubkey: input.oracleSwitchboardTwap,
          isSigner: false,
          isWritable: false,
        },
        { pubkey: input.oracleScopeConfig, isSigner: false, isWritable: false },
        { pubkey: input.kaminoProgram, isSigner: false, isWritable: false },
        { pubkey: input.instructionSysvar, isSigner: false, isWritable: false },
        { pubkey: input.tokenProgram, isSigner: false, isWritable: false },
        {
          pubkey: accountsMap["associatedTokenProgram"],
          isSigner: false,
          isWritable: false,
        },
        { pubkey: input.systemProgram, isSigner: false, isWritable: false },
      ],
      data,
    });
  }

  createSetFamilyLastDistributionInstruction(
    input: SetFamilyLastDistributionInstructionInput
  ): TransactionInstruction {
    const argsCodec = getStructCodec([["newLastDistribution", getI64Codec()]]);
    const data = Buffer.from([
      7,
      ...argsCodec.encode({ newLastDistribution: input.newLastDistribution }),
    ]);
    return new TransactionInstruction({
      programId: SeedlingQuasarClient.programId,
      keys: [
        { pubkey: input.vaultConfig, isSigner: false, isWritable: false },
        { pubkey: input.familyPosition, isSigner: false, isWritable: true },
        { pubkey: input.authority, isSigner: true, isWritable: false },
      ],
      data,
    });
  }

  createRollPeriodInstruction(
    input: RollPeriodInstructionInput
  ): TransactionInstruction {
    const argsCodec = getStructCodec([["nextPeriodEndTs", getI64Codec()]]);
    const data = Buffer.from([
      8,
      ...argsCodec.encode({ nextPeriodEndTs: input.nextPeriodEndTs }),
    ]);
    return new TransactionInstruction({
      programId: SeedlingQuasarClient.programId,
      keys: [
        { pubkey: input.vaultConfig, isSigner: false, isWritable: true },
        { pubkey: input.authority, isSigner: true, isWritable: false },
      ],
      data,
    });
  }

  createSetPausedInstruction(
    input: SetPausedInstructionInput
  ): TransactionInstruction {
    const argsCodec = getStructCodec([["paused", getBooleanCodec()]]);
    const data = Buffer.from([
      9,
      ...argsCodec.encode({ paused: input.paused }),
    ]);
    return new TransactionInstruction({
      programId: SeedlingQuasarClient.programId,
      keys: [
        { pubkey: input.vaultConfig, isSigner: false, isWritable: true },
        { pubkey: input.authority, isSigner: true, isWritable: false },
      ],
      data,
    });
  }
}

/* Errors */
export const PROGRAM_ERRORS: Record<number, { name: string; msg?: string }> = {
  0: { name: "Overflow" },
  1: { name: "Underflow" },
  2: { name: "DivisionByZero" },
  3: { name: "InvalidAmount" },
  4: { name: "InvalidAuthority" },
  5: { name: "InvalidStreamRate" },
  6: { name: "MintMismatch" },
  7: { name: "ReserveMismatch" },
  8: { name: "VaultPaused" },
  9: { name: "InsufficientShares" },
  10: { name: "SlippageExceeded" },
  11: { name: "DistributionTooEarly" },
  12: { name: "TooEarly" },
  13: { name: "BonusPeriodNotEnded" },
  14: { name: "BonusAlreadyPaid" },
  15: { name: "PeriodNotEnded" },
  16: { name: "NoYieldAccrued" },
  17: { name: "AlreadyDistributedForPeriod" },
  18: { name: "FamilyNotEmpty" },
  19: { name: "InvalidKaminoAccount" },
  20: { name: "InvalidOracle" },
  21: { name: "BelowDustThreshold" },
};
