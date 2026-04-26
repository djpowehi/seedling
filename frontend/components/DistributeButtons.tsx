"use client";

import { useEffect, useState } from "react";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import { DEVNET_ADDRESSES, PROGRAM_ID } from "@/lib/program";
import type { FamilyView } from "@/lib/fetchFamilies";
import type { Seedling } from "@/lib/types";

const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);

const MONTH_SECONDS = 30 * 86_400;

type Props = {
  program: Program<Seedling>;
  connection: Connection;
  parent: PublicKey;
  family: FamilyView;
  onDistributed: () => void;
};

type VaultClock = {
  periodEndTs: number;
  currentPeriodId: number;
};

export function DistributeButtons({
  program,
  connection,
  parent,
  family,
  onDistributed,
}: Props) {
  const [clock, setClock] = useState<VaultClock | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [submitting, setSubmitting] = useState<"monthly" | "bonus" | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  // Fetch period_end_ts once. Tick `now` every 1s so the gate flips live.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const cfg = (await program.account.vaultConfig.fetch(
          DEVNET_ADDRESSES.vaultConfig
        )) as { periodEndTs: { toString(): string }; currentPeriodId: number };
        if (cancelled) return;
        setClock({
          periodEndTs: Number(cfg.periodEndTs.toString()),
          currentPeriodId: Number(cfg.currentPeriodId),
        });
      } catch {
        // If chain read fails, fall back to disabled state.
      }
    };
    load();
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [program]);

  const lastDist = Number(family.lastDistribution.toString());
  const monthlyEligibleAt = lastDist + MONTH_SECONDS;
  const monthlyReady = now >= monthlyEligibleAt;

  const bonusReady =
    clock !== null &&
    now >= clock.periodEndTs &&
    family.lastBonusPeriodId < clock.currentPeriodId;

  const formatRemaining = (target: number): string => {
    const delta = Math.max(0, target - now);
    const days = Math.floor(delta / 86_400);
    const hours = Math.floor((delta % 86_400) / 3_600);
    const mins = Math.floor((delta % 3_600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  const buildKaminoAccounts = () => {
    const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from("lma"), DEVNET_ADDRESSES.kaminoMarket.toBuffer()],
      DEVNET_ADDRESSES.klendProgram
    );
    return {
      kaminoReserve: DEVNET_ADDRESSES.kaminoReserve,
      lendingMarket: DEVNET_ADDRESSES.kaminoMarket,
      lendingMarketAuthority,
      reserveLiquiditySupply: DEVNET_ADDRESSES.reserveLiquiditySupply,
      oraclePyth: DEVNET_ADDRESSES.oraclePyth,
      oracleSwitchboardPrice: DEVNET_ADDRESSES.klendProgram,
      oracleSwitchboardTwap: DEVNET_ADDRESSES.klendProgram,
      oracleScopeConfig: DEVNET_ADDRESSES.klendProgram,
      kaminoProgram: DEVNET_ADDRESSES.klendProgram,
      instructionSysvar: SYSVAR_INSTRUCTIONS,
    };
  };

  const buildSharedAccounts = () => {
    const [kidViewPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("kid"), parent.toBuffer(), family.kid.toBuffer()],
      PROGRAM_ID
    );
    const kidUsdcAta = getAssociatedTokenAddressSync(
      DEVNET_ADDRESSES.usdcMint,
      family.kid
    );
    return {
      keeper: parent,
      familyPosition: family.pubkey,
      kidView: kidViewPda,
      kidUsdcAta,
      kidOwner: family.kid,
      vaultUsdcAta: DEVNET_ADDRESSES.vaultUsdcAta,
      vaultCtokenAta: DEVNET_ADDRESSES.vaultCtokenAta,
      treasuryUsdcAta: DEVNET_ADDRESSES.treasury,
      vaultConfig: DEVNET_ADDRESSES.vaultConfig,
      usdcMint: DEVNET_ADDRESSES.usdcMint,
      ctokenMint: DEVNET_ADDRESSES.ctokenMint,
      ...buildKaminoAccounts(),
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };
  };

  // Idempotent ATA for kid (kid never signs; parent pays the rent).
  // Without this, the first ever distribute for a kid fails because
  // their USDC ATA doesn't exist yet.
  const buildPreIxs = () => {
    const kidUsdcAta = getAssociatedTokenAddressSync(
      DEVNET_ADDRESSES.usdcMint,
      family.kid
    );
    return [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
      createAssociatedTokenAccountIdempotentInstruction(
        parent,
        kidUsdcAta,
        family.kid,
        DEVNET_ADDRESSES.usdcMint
      ),
    ];
  };

  const handleMonthly = async () => {
    if (!monthlyReady || submitting) return;
    setSubmitting("monthly");
    setError(null);
    try {
      const sig = await program.methods
        .distributeMonthlyAllowance()
        .accountsPartial(buildSharedAccounts())
        .preInstructions(buildPreIxs())
        .rpc({ commitment: "confirmed" });
      console.log(`[distribute_monthly] tx ${sig}`);
      await connection.confirmTransaction(sig, "confirmed");
      onDistributed();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already been processed")) {
        await connection.confirmTransaction("", "confirmed").catch(() => {});
        onDistributed();
        return;
      }
      if (msg.includes("DistributionTooSoon"))
        setError("Not eligible yet — try again after the countdown ends.");
      else if (msg.includes("VaultPaused"))
        setError("The vault is paused. Try again later.");
      else setError(msg);
    } finally {
      setSubmitting(null);
    }
  };

  const handleBonus = async () => {
    if (!bonusReady || submitting) return;
    setSubmitting("bonus");
    setError(null);
    try {
      const sig = await program.methods
        .distributeBonus()
        .accountsPartial(buildSharedAccounts())
        .preInstructions(buildPreIxs())
        .rpc({ commitment: "confirmed" });
      console.log(`[distribute_bonus] tx ${sig}`);
      await connection.confirmTransaction(sig, "confirmed");
      onDistributed();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already been processed")) {
        onDistributed();
        return;
      }
      if (msg.includes("PeriodNotEnded"))
        setError("13th allowance not ready yet.");
      else if (msg.includes("BonusAlreadyClaimed"))
        setError("This year's bonus has already been distributed.");
      else if (msg.includes("VaultPaused"))
        setError("The vault is paused. Try again later.");
      else setError(msg);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleMonthly}
          disabled={!monthlyReady || submitting !== null}
          className="rounded-full bg-emerald-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed"
          title={
            monthlyReady
              ? "Send this month's allowance to your kid"
              : `Available in ${formatRemaining(monthlyEligibleAt)}`
          }
        >
          {submitting === "monthly"
            ? "Sending…"
            : monthlyReady
            ? "Send monthly allowance"
            : `Monthly in ${formatRemaining(monthlyEligibleAt)}`}
        </button>
        <button
          type="button"
          onClick={handleBonus}
          disabled={!bonusReady || submitting !== null}
          className="rounded-full bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed"
          title={
            bonusReady
              ? "Send the 13th allowance (year-end yield bonus)"
              : clock
              ? `13th allowance in ${formatRemaining(clock.periodEndTs)}`
              : "Loading…"
          }
        >
          {submitting === "bonus"
            ? "Sending…"
            : bonusReady
            ? "Send 13th allowance 🎁"
            : clock
            ? `13th in ${formatRemaining(clock.periodEndTs)}`
            : "13th in …"}
        </button>
      </div>
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {error}
        </div>
      )}
    </div>
  );
}
