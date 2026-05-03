"use client";

import { useEffect, useRef, useState } from "react";
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
import { useWallet } from "@solana/wallet-adapter-react";
import { DEVNET_ADDRESSES, PROGRAM_ID } from "@/lib/program";
import { SeedlingQuasarClient } from "@/lib/quasar-client";
import { kidViewPda as deriveKidViewPda } from "@/lib/quasarPdas";
import { sendQuasarIx } from "@/lib/sendQuasarIx";
import { celebrateBonus, celebrateMonthly } from "@/lib/celebrate";
import { fetchFamilyByPda } from "@/lib/fetchFamilyByPda";
import {
  encodeKidNameToUrl,
  getKidName,
  removeKidName,
  setKidName,
} from "@/lib/kidNames";
import {
  depositForMonth,
  getDepositMode,
  modeLabel,
  type DepositMode,
} from "@/lib/depositMode";
import {
  getSavingsGoals,
  removeSavingsGoal,
  type SavingsGoal,
} from "@/lib/savingsGoals";
import type { FamilyView } from "@/lib/fetchFamilies";
import { useToast } from "@/components/Toast";
import { DepositForm } from "@/components/DepositForm";
import { WithdrawForm } from "@/components/WithdrawForm";
import { ArrowUR, Copy, Plus } from "./icons";
import { GoalRow } from "./GoalRow";
import { AddGoalInline } from "./AddGoalInline";
import { GiftsSection } from "./GiftsSection";

const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);
const MONTH_SECONDS = 30 * 86_400;

type VaultClock = {
  periodEndTs: number;
  currentPeriodId: number;
};

type Props = {
  family: FamilyView;
  connection: Connection;
  parent: PublicKey;
  vaultClock: VaultClock | null;
  onMutated: () => void;
};

function fmtUSD(n: number): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function truncatePub(pubkey: PublicKey): string {
  const s = pubkey.toBase58();
  return s.slice(0, 4) + "…" + s.slice(-4);
}

function fmtAgo(seconds: number): string {
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fmtCountdown(seconds: number): string {
  if (seconds <= 0) return "ready";
  const totalH = Math.floor(seconds / 3600);
  const d = Math.floor(totalH / 24);
  const h = totalH % 24;
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

/** Compact display for big share counts. Past ~100K the extra digits are
 *  cognitive noise — what matters is "this is roughly how much the
 *  family owns of the vault", not the precise base-unit count.
 *  Scales: <1K → exact, 1K → "1.2K", 1M → "1.2M", 1B → "1.2B". */
function fmtShares(n: number): string {
  if (n < 1_000) return Math.trunc(n).toString();
  if (n < 1_000_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  if (n < 1_000_000_000)
    return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  return (n / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "") + "B";
}

export function FamilyCard({
  family,
  connection,
  parent,
  vaultClock,
  onMutated,
}: Props) {
  const wallet = useWallet();
  const client = new SeedlingQuasarClient();
  const familyKey = family.pubkey.toBase58();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);
  // Once true, the card animates out (opacity + scale) before we call
  // onMutated() to remove it from the parent's list. Reads as "this kid's
  // chapter is closing" instead of a hard pop.
  const [closing, setClosing] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [addingGoal, setAddingGoal] = useState(false);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [submitting, setSubmitting] = useState<
    "monthly" | "bonus" | "remove" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const [depositMode, setLocalDepositMode] = useState<DepositMode>("yearly");
  useEffect(() => {
    setName(getKidName(familyKey));
    setGoals(getSavingsGoals(familyKey));
    setLocalDepositMode(getDepositMode(familyKey));
  }, [familyKey]);

  useEffect(() => {
    const interval = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000
    );
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (renaming) renameRef.current?.select();
  }, [renaming]);

  // Derived
  const createdAtSec = Number(family.createdAt.toString());
  const lastDistSec = Number(family.lastDistribution.toString());
  const principalUsd = Number(family.principalRemaining.toString()) / 1_000_000;
  const yieldUsd = Number(family.totalYieldEarned.toString()) / 1_000_000;
  const streamUsd = Number(family.streamRate.toString()) / 1_000_000;
  const sharesInt = Number(family.shares.toString());
  const yieldPct = principalUsd > 0 ? (yieldUsd / principalUsd) * 100 : 0;
  const combinedBalanceUsd = principalUsd + yieldUsd;

  const monthlyEligibleAt = lastDistSec + MONTH_SECONDS;
  const monthlySecondsLeft = Math.max(0, monthlyEligibleAt - now);
  const monthlyReady = monthlySecondsLeft <= 0;

  const bonusReady =
    vaultClock !== null &&
    now >= vaultClock.periodEndTs &&
    family.lastBonusPeriodId < vaultClock.currentPeriodId;
  const bonusSecondsLeft = vaultClock
    ? Math.max(0, vaultClock.periodEndTs - now)
    : Infinity;

  const commitName = (next: string) => {
    setKidName(familyKey, next);
    setName(next.trim() || null);
    setRenaming(false);
  };

  const refreshGoals = () => setGoals(getSavingsGoals(familyKey));

  const copyKidPubkey = async () => {
    await navigator.clipboard?.writeText(family.kid.toBase58());
    showToast({ title: "kid pubkey copied" });
  };

  const buildKidPageUrl = () => {
    // Bake the kid's name into the link so the receiving device sees
    // "hi Maria" on first load instead of "hi friend". The kid view
    // strips `?n=` after persisting the name to localStorage.
    const base = `${window.location.origin}/kid/${familyKey}`;
    return encodeKidNameToUrl(base, getKidName(familyKey));
  };

  const copyKidPageLink = async () => {
    await navigator.clipboard?.writeText(buildKidPageUrl());
    showToast({ title: "kid's page link copied" });
  };

  const shareKidPageLink = async () => {
    const url = buildKidPageUrl();
    const kidLabel = getKidName(familyKey) ?? "your kid";
    // Native share sheet on mobile + supported desktop browsers; clipboard
    // fallback elsewhere so the button is never a dead end.
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({
          title: `${kidLabel}'s seedling page`,
          text: `${kidLabel}'s growing savings on seedling.`,
          url,
        });
        return;
      } catch {
        // user cancelled or share failed → fall through to clipboard copy.
      }
    }
    await navigator.clipboard?.writeText(url);
    showToast({ title: "share unavailable here · link copied instead" });
  };

  // ───── chain handlers ─────

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

  const buildSharedDistributeAccounts = () => {
    const kidView = deriveKidViewPda(parent, family.kid);
    const kidUsdcAta = getAssociatedTokenAddressSync(
      DEVNET_ADDRESSES.usdcMint,
      family.kid
    );
    return {
      keeper: parent,
      familyPosition: family.pubkey,
      kidView,
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
      systemProgram: SystemProgram.programId,
    };
  };

  const distributePreIxs = () => {
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
      const ix = client.createDistributeMonthlyAllowanceInstruction(
        buildSharedDistributeAccounts()
      );
      const sig = await sendQuasarIx(
        [...distributePreIxs(), ix],
        connection,
        wallet,
        { commitment: "confirmed" }
      );
      console.log(`[distribute_monthly] tx ${sig}`);
      celebrateMonthly();
      showToast({
        variant: "monthly",
        title: `Sent to ${name ?? "your kid"}`,
        countUpUsd: streamUsd,
        subtitle: "monthly allowance · on chain",
      });
      onMutated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already been processed")) {
        onMutated();
        return;
      }
      if (msg.includes("DistributionTooSoon")) setError("Not eligible yet.");
      else if (msg.includes("VaultPaused"))
        setError("Vault paused. Try again later.");
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
      const yieldBefore = Number(family.totalYieldEarned.toString());
      const ix = client.createDistributeBonusInstruction(
        buildSharedDistributeAccounts()
      );
      const sig = await sendQuasarIx(
        [...distributePreIxs(), ix],
        connection,
        wallet,
        { commitment: "confirmed" }
      );
      console.log(`[distribute_bonus] tx ${sig}`);
      let bonusUsd = 0;
      try {
        const refetched = await fetchFamilyByPda(connection, family.pubkey);
        if (refetched) {
          const yieldAfter = Number(refetched.totalYieldEarned.toString());
          bonusUsd = Math.max(0, (yieldAfter - yieldBefore) / 1_000_000);
        }
      } catch {
        // skip count-up if refetch fails
      }
      celebrateBonus();
      showToast({
        variant: "bonus",
        title: `${name ?? "Your kid"}'s annual bonus arrived`,
        countUpUsd: bonusUsd > 0 ? bonusUsd : undefined,
        subtitle: "year-end yield · sent on chain",
      });
      onMutated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already been processed")) {
        onMutated();
        return;
      }
      if (msg.includes("BonusPeriodNotEnded") || msg.includes("PeriodNotEnded"))
        setError("Annual bonus not ready yet.");
      else if (
        msg.includes("BonusAlreadyPaid") ||
        msg.includes("BonusAlreadyClaimed")
      )
        setError("Bonus already distributed for this period.");
      else if (msg.includes("BelowDustThreshold"))
        setError(
          "No yield to distribute yet — the vault hasn't earned enough on Kamino. Try again next month."
        );
      else if (msg.includes("VaultPaused"))
        setError("Vault paused. Try again later.");
      else setError(msg);
    } finally {
      setSubmitting(null);
    }
  };

  const handleRemove = async () => {
    if (submitting) return;
    if (
      !window.confirm(
        `Remove ${
          name ?? "this kid"
        }? Any remaining USDC will be sent to your wallet, and the on-chain accounts close.`
      )
    )
      return;

    setSubmitting("remove");
    setError(null);
    try {
      const parentUsdcAta = getAssociatedTokenAddressSync(
        DEVNET_ADDRESSES.usdcMint,
        parent
      );
      const kidView = deriveKidViewPda(parent, family.kid);
      const ataIx = createAssociatedTokenAccountIdempotentInstruction(
        parent,
        parentUsdcAta,
        parent,
        DEVNET_ADDRESSES.usdcMint
      );

      const closeIx = client.createCloseFamilyInstruction({
        familyPosition: family.pubkey,
        kidView,
        parent,
        parentUsdcAta,
        vaultUsdcAta: DEVNET_ADDRESSES.vaultUsdcAta,
        vaultCtokenAta: DEVNET_ADDRESSES.vaultCtokenAta,
        treasuryUsdcAta: DEVNET_ADDRESSES.treasury,
        vaultConfig: DEVNET_ADDRESSES.vaultConfig,
        usdcMint: DEVNET_ADDRESSES.usdcMint,
        ctokenMint: DEVNET_ADDRESSES.ctokenMint,
        ...buildKaminoAccounts(),
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      });
      const sig = await sendQuasarIx(
        [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
          ataIx,
          closeIx,
        ],
        connection,
        wallet,
        { commitment: "confirmed" }
      );
      // Soft fade-out of the card itself BEFORE removal. localStorage is
      // wiped immediately (cheap), but onMutated is delayed to let the
      // CSS transition play — reads as a quiet farewell, not a hard pop.
      removeKidName(familyKey);
      removeSavingsGoal(familyKey);
      showToast({
        variant: "info",
        title: name ? `${name}'s vault is closed` : "vault closed",
        subtitle: "remaining USDC returned · accounts closed",
      });
      setClosing(true);
      setTimeout(() => onMutated(), 600);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already been processed")) {
        removeKidName(familyKey);
        removeSavingsGoal(familyKey);
        showToast({
          variant: "info",
          title: name ? `${name}'s vault is closed` : "vault closed",
          subtitle: "remaining USDC returned · accounts closed",
        });
        setClosing(true);
        setTimeout(() => onMutated(), 600);
        return;
      }
      setError(msg);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <article
      className="dash-card"
      style={{
        padding: "32px 32px 24px",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        transition:
          "opacity 520ms ease-out, transform 520ms ease-out, filter 520ms ease-out",
        opacity: closing ? 0 : 1,
        transform: closing ? "scale(0.97) translateY(6px)" : "none",
        filter: closing ? "saturate(0.6)" : "none",
        pointerEvents: closing ? "none" : "auto",
      }}
    >
      {/* Top: name + age */}
      <div
        className="dash-row"
        style={{
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <div className="dash-col" style={{ flex: 1, minWidth: 0 }}>
          {renaming ? (
            <input
              ref={renameRef}
              className="dash-rename-input"
              style={{ fontSize: 38, lineHeight: 1, fontStyle: "italic" }}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => commitName(nameDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName(nameDraft);
                if (e.key === "Escape") setRenaming(false);
              }}
            />
          ) : (
            <h2
              className="dash-serif dash-italic dash-rename-target"
              style={{
                fontSize: 38,
                lineHeight: 1,
                margin: 0,
                color: "var(--ink)",
              }}
              onClick={() => {
                setNameDraft(name ?? "");
                setRenaming(true);
              }}
              title="click to rename"
            >
              {name ?? "unnamed"}
            </h2>
          )}
          <div
            className="dash-row"
            style={{ alignItems: "center", gap: 8, marginTop: 8 }}
          >
            <span
              className="dash-mono"
              style={{ fontSize: 11, color: "var(--ink-3)" }}
            >
              {truncatePub(family.kid)}
            </span>
            <button
              className="dash-btn-link"
              style={{ padding: 0, fontSize: 10 }}
              onClick={copyKidPubkey}
            >
              <Copy /> copy
            </button>
          </div>
        </div>
        <div className="dash-col" style={{ alignItems: "flex-end", gap: 6 }}>
          <span
            className="dash-mono"
            style={{
              fontSize: 10,
              color: "var(--forest)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "4px 8px",
              border: "1px solid var(--forest-soft)",
              borderRadius: 99,
              background: "var(--forest-soft)",
              whiteSpace: "nowrap",
            }}
          >
            {modeLabel(depositMode)} cadence
          </span>
          <span
            className="dash-mono"
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              whiteSpace: "nowrap",
            }}
          >
            created {fmtAgo(now - createdAtSec)}
          </span>
        </div>
      </div>

      {/* Stat row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 20,
          padding: "24px 0",
          marginTop: 24,
          borderTop: "1px solid var(--line-soft)",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <StatCell
          label="Stream"
          value={`$${streamUsd.toFixed(0)}/mo`}
          sub="usdc"
        />
        <StatCell
          label="Principal"
          value={fmtUSD(principalUsd)}
          sub="locked in vault"
        />
        <StatCell
          label="Shares"
          value={fmtShares(sharesInt)}
          sub="of vault total"
        />
        <StatCell
          label="Yield earned"
          value={fmtUSD(yieldUsd)}
          sub={`+${yieldPct.toFixed(2)}%`}
        />
      </div>

      {/* Footer meta row */}
      <div
        className="dash-row"
        style={{
          alignItems: "center",
          gap: 14,
          marginTop: 12,
          flexWrap: "wrap",
        }}
      >
        <span
          className="dash-mono"
          style={{ fontSize: 11, color: "var(--ink-3)" }}
        >
          last paid {fmtAgo(now - lastDistSec)}
        </span>
        <span
          style={{
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: "var(--line)",
          }}
        />
        <button className="dash-btn-link" onClick={shareKidPageLink}>
          share link
        </button>
        <span
          style={{
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: "var(--line)",
          }}
        />
        <button className="dash-btn-link" onClick={copyKidPageLink}>
          copy link
        </button>
        <span
          style={{
            width: 3,
            height: 3,
            borderRadius: "50%",
            background: "var(--line)",
          }}
        />
        <a
          className="dash-btn-link"
          href={`/kid/${familyKey}`}
          target="_blank"
          rel="noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          kid&apos;s page <ArrowUR />
        </a>
      </div>

      {/* Action buttons */}
      <div
        className="dash-row"
        style={{ gap: 10, marginTop: 24, flexWrap: "wrap" }}
      >
        <button
          className="dash-btn dash-btn-primary"
          onClick={() => {
            setShowWithdraw(false);
            setShowDeposit((v) => !v);
          }}
          disabled={submitting !== null}
        >
          <Plus /> deposit
        </button>
        <button
          className="dash-btn dash-btn-ghost"
          disabled={family.shares.isZero() || submitting !== null}
          onClick={() => {
            setShowDeposit(false);
            setShowWithdraw((v) => !v);
          }}
        >
          withdraw
        </button>
        <button
          className={`dash-btn ${
            monthlyReady ? "dash-btn-ghost" : "dash-btn-disabled-state"
          }`}
          disabled={!monthlyReady || submitting !== null}
          onClick={handleMonthly}
          title={
            monthlyReady
              ? "send this month's allowance"
              : `available in ${fmtCountdown(monthlySecondsLeft)}`
          }
        >
          {submitting === "monthly"
            ? "sending…"
            : monthlyReady
            ? "Send monthly"
            : `Monthly in ${fmtCountdown(monthlySecondsLeft)}`}
        </button>
        <button
          className={`dash-btn ${
            bonusReady ? "dash-btn-ghost" : "dash-btn-disabled-state"
          }`}
          disabled={!bonusReady || submitting !== null}
          onClick={handleBonus}
          title={
            bonusReady
              ? "send the year-end bonus"
              : vaultClock
              ? `available in ${fmtCountdown(bonusSecondsLeft)}`
              : "loading…"
          }
        >
          <span aria-hidden="true">🎁</span>{" "}
          {submitting === "bonus"
            ? "sending…"
            : bonusReady
            ? "Send bonus"
            : vaultClock
            ? `Bonus in ${fmtCountdown(bonusSecondsLeft)}`
            : "Bonus in …"}
        </button>
      </div>

      {error && (
        <div
          className="dash-mono"
          style={{
            color: "var(--rose)",
            fontSize: 12,
            marginTop: 10,
          }}
        >
          {error}
        </div>
      )}

      {showDeposit && (
        <div style={{ marginTop: 16 }}>
          <DepositForm
            connection={connection}
            parent={parent}
            family={family}
            onCancel={() => setShowDeposit(false)}
            onDeposited={() => {
              setShowDeposit(false);
              onMutated();
            }}
          />
        </div>
      )}

      {showWithdraw && (
        <div style={{ marginTop: 16 }}>
          <WithdrawForm
            connection={connection}
            parent={parent}
            family={family}
            onCancel={() => setShowWithdraw(false)}
            onWithdrawn={() => {
              setShowWithdraw(false);
              onMutated();
            }}
          />
        </div>
      )}

      {/* Deposit cadence reminder — only for hybrid + monthly families.
          Shows the recommended top-up for THIS month based on the chosen
          mode + the family's current "month index" (months since the
          family was created). Click → opens the deposit form. */}
      {depositMode !== "yearly" &&
        (() => {
          const monthsSinceCreated = Math.max(
            0,
            Math.floor((now - createdAtSec) / MONTH_SECONDS)
          );
          const monthIndex = Math.min(11, monthsSinceCreated);
          const expectedDeposit = depositForMonth(
            depositMode,
            monthIndex,
            streamUsd
          );
          if (expectedDeposit <= 0) return null;
          return (
            <div
              style={{
                marginTop: 24,
                padding: "14px 18px",
                borderRadius: 10,
                border: "1px solid var(--forest-soft)",
                background: "var(--forest-soft)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div className="dash-col" style={{ gap: 2 }}>
                <span
                  className="dash-mono"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--forest-deep)",
                  }}
                >
                  {modeLabel(depositMode)} cadence · this month
                </span>
                <span
                  className="dash-serif"
                  style={{
                    fontSize: 22,
                    color: "var(--forest-deep)",
                    letterSpacing: "-0.005em",
                  }}
                >
                  deposit ${expectedDeposit.toFixed(2)} to keep yield growing
                </span>
              </div>
              <button
                type="button"
                className="dash-btn dash-btn-primary"
                onClick={() => {
                  setShowWithdraw(false);
                  setShowDeposit(true);
                }}
              >
                + top up
              </button>
            </div>
          );
        })()}

      {/* Goals */}
      <div className="dash-col" style={{ marginTop: 32 }}>
        <div
          className="dash-row"
          style={{
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 4,
          }}
        >
          <span className="dash-field-label" style={{ marginBottom: 0 }}>
            Savings goals
          </span>
          <span
            className="dash-mono"
            style={{
              fontSize: 10,
              color: "var(--ink-3)",
              letterSpacing: "0.04em",
            }}
          >
            {goals.length} active
          </span>
        </div>
        <div className="dash-col">
          {goals.map((g) => (
            <GoalRow
              key={g.id}
              familyPubkey={familyKey}
              goal={g}
              combinedBalanceUsd={combinedBalanceUsd}
              editing={editingGoalId === g.id}
              onEditStart={() => setEditingGoalId(g.id)}
              onEditEnd={() => setEditingGoalId(null)}
              onChange={refreshGoals}
            />
          ))}
          {addingGoal ? (
            <AddGoalInline
              familyPubkey={familyKey}
              onSaved={() => {
                refreshGoals();
                setAddingGoal(false);
              }}
              onCancel={() => setAddingGoal(false)}
            />
          ) : (
            <button
              className="dash-btn-link"
              style={{
                alignSelf: "flex-start",
                marginTop: 12,
                fontSize: 11,
              }}
              onClick={() => setAddingGoal(true)}
            >
              + add another goal
            </button>
          )}
        </div>
      </div>

      <GiftsSection
        familyPda={family.pubkey}
        parent={parent}
        kidName={name}
        connection={connection}
      />

      {/* Remove */}
      <div
        className="dash-row"
        style={{ marginTop: 28, justifyContent: "flex-end" }}
      >
        <button
          className="dash-btn-link dash-btn-link-danger"
          onClick={handleRemove}
          disabled={submitting !== null}
        >
          {submitting === "remove" ? "removing…" : "remove kid"}
        </button>
      </div>
    </article>
  );
}

function StatCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="dash-col" style={{ gap: 6, minWidth: 0 }}>
      <span className="dash-field-label" style={{ marginBottom: 0 }}>
        {label}
      </span>
      <span
        className="dash-serif"
        style={{
          fontSize: 26,
          lineHeight: 1,
          color: "var(--ink)",
        }}
      >
        {value}
      </span>
      {sub && (
        <span
          className="dash-mono"
          style={{ fontSize: 11, color: "var(--ink-3)" }}
        >
          {sub}
        </span>
      )}
    </div>
  );
}
