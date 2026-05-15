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
import { useSeedlingWallet } from "@/lib/wallet";
import { DEVNET_ADDRESSES, PROGRAM_ID, SPONSOR_WALLET } from "@/lib/program";
import { SeedlingQuasarClient } from "@/lib/quasar-client";
import { kidViewPda as deriveKidViewPda } from "@/lib/quasarPdas";
import { sendQuasarIxSponsored } from "@/lib/sendQuasarIx";
import { celebrateBonus, celebrateMonthly } from "@/lib/celebrate";
import { fetchFamilyByPda } from "@/lib/fetchFamilyByPda";
import {
  encodeKidNameToUrl,
  getKidName,
  removeKidName,
  setKidName,
} from "@/lib/kidNames";
import {
  formatPixKeyForDisplay,
  getKidPixKey,
  removeKidPixKey,
  setKidPixKey,
} from "@/lib/kidPix";
import { removeDraftFamily, updateDraftMonthly } from "@/lib/draftFamilies";
import { isValidCpf, isValidEmail } from "@/lib/pixProfile";
import {
  depositForMonth,
  getDepositMode,
  type DepositMode,
} from "@/lib/depositMode";
import { useLocale } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import {
  getSavingsGoals,
  removeSavingsGoal,
  type SavingsGoal,
} from "@/lib/savingsGoals";
import type { FamilyView } from "@/lib/fetchFamilies";
import { useToast } from "@/components/Toast";
import { DepositForm } from "@/components/DepositForm";
import { PixOfframpForm } from "@/components/PixOfframpForm";
import { WithdrawForm } from "@/components/WithdrawForm";
import { ArrowUR, PixLogo, MoonPayLogo, Plus } from "./icons";
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

// Locale-aware "ago" + "countdown" formatters. Need t() at call site so
// they update when the user toggles language. Hooked into useLocale via
// the makeFmt helpers below.
function makeFmtAgo(
  t: (k: TranslationKey, vars?: Record<string, string | number>) => string
) {
  return (seconds: number): string => {
    if (seconds < 60) return t("card.ago.just_now");
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t("card.ago.minutes", { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("card.ago.hours", { n: hours });
    const days = Math.floor(hours / 24);
    return t("card.ago.days", { n: days });
  };
}

function makeFmtCountdown(
  t: (k: TranslationKey, vars?: Record<string, string | number>) => string
) {
  return (seconds: number): string => {
    if (seconds <= 0) return t("card.countdown.ready");
    const totalH = Math.floor(seconds / 3600);
    const d = Math.floor(totalH / 24);
    const h = totalH % 24;
    if (d > 0) return t("card.countdown.dh", { d, h });
    const m = Math.floor((seconds % 3600) / 60);
    return t("card.countdown.hm", { h, m });
  };
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
  const wallet = useSeedlingWallet();
  const client = new SeedlingQuasarClient();
  const { t, locale } = useLocale();
  const fmtAgo = makeFmtAgo(t);
  const fmtCountdown = makeFmtCountdown(t);
  const familyKey = family.pubkey.toBase58();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [pixKey, setPixKey] = useState<string | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  // Full-edit panel state. Distinct from inline-rename above — that's a
  // quick-tap to fix a typo; this one bundles name + Pix key + monthly
  // (which involves an on-chain `set_stream_rate` tx).
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPix, setEditPix] = useState("");
  const [editMonthly, setEditMonthly] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  // Once true, the card animates out (opacity + scale) before we call
  // onMutated() to remove it from the parent's list. Reads as "this kid's
  // chapter is closing" instead of a hard pop.
  const [closing, setClosing] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showPixOfframp, setShowPixOfframp] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [addingGoal, setAddingGoal] = useState(false);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [submitting, setSubmitting] = useState<
    "monthly" | "bonus" | "remove" | "edit" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const [depositMode, setLocalDepositMode] = useState<DepositMode>("yearly");
  useEffect(() => {
    setName(getKidName(familyKey));
    setPixKey(getKidPixKey(familyKey));
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

  const buildKidPageUrl = () => {
    // Bake the kid's name into the link so the receiving device sees
    // "hi Maria" on first load instead of "hi friend". The kid view
    // strips `?n=` after persisting the name to localStorage.
    const base = `${window.location.origin}/kid/${familyKey}`;
    return encodeKidNameToUrl(base, getKidName(familyKey));
  };

  const copyKidPageLink = async () => {
    await navigator.clipboard?.writeText(buildKidPageUrl());
    showToast({ title: t("card.toast.link_copied") });
  };

  const shareKidPageLink = async () => {
    const url = buildKidPageUrl();
    const kidLabel = getKidName(familyKey) ?? t("card.share.fallback_kid");
    // Native share sheet on mobile + supported desktop browsers; clipboard
    // fallback elsewhere so the button is never a dead end.
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({
          title: t("card.share.title", { name: kidLabel }),
          text: t("card.share.text", { name: kidLabel }),
          url,
        });
        return;
      } catch {
        // user cancelled or share failed → fall through to clipboard copy.
      }
    }
    await navigator.clipboard?.writeText(url);
    showToast({ title: t("card.toast.share_fallback") });
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
      oracleScopeConfig: DEVNET_ADDRESSES.oracleScopeConfig,
      kaminoProgram: DEVNET_ADDRESSES.klendProgram,
      instructionSysvar: SYSVAR_INSTRUCTIONS,
    };
  };

  const buildSharedDistributeAccounts = () => {
    const kidView = deriveKidViewPda(parent, family.kid);
    // v3: kid pool ATA is owned by the family_position PDA, not the kid.
    // allowOwnerOffCurve=true because family_position is a PDA (off-curve).
    const kidPoolAta = getAssociatedTokenAddressSync(
      DEVNET_ADDRESSES.usdcMint,
      family.pubkey,
      true
    );
    return {
      keeper: parent,
      familyPosition: family.pubkey,
      kidView,
      kidPoolAta,
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
    const kidPoolAta = getAssociatedTokenAddressSync(
      DEVNET_ADDRESSES.usdcMint,
      family.pubkey,
      true
    );
    return [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
      // Sponsor pays the ATA rent (~$0.20). Parent wallet has 0 SOL by
      // design — Solana would otherwise reject the inner SystemProgram
      // transfer with "insufficient lamports".
      createAssociatedTokenAccountIdempotentInstruction(
        SPONSOR_WALLET,
        kidPoolAta,
        family.pubkey,
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
      const sig = await sendQuasarIxSponsored(
        [...distributePreIxs(), ix],
        connection,
        wallet,
        SPONSOR_WALLET,
        { commitment: "confirmed" }
      );
      console.log(`[distribute_monthly] tx ${sig}`);
      celebrateMonthly();
      showToast({
        variant: "monthly",
        title: name
          ? t("card.toast.monthly_title.named", { name })
          : t("card.toast.monthly_title.fallback"),
        countUpUsd: streamUsd,
        subtitle: t("card.toast.monthly_subtitle"),
      });
      onMutated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already been processed")) {
        onMutated();
        return;
      }
      if (msg.includes("DistributionTooSoon"))
        setError(t("card.error.not_eligible"));
      else if (msg.includes("VaultPaused")) setError(t("card.error.paused"));
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
      const sig = await sendQuasarIxSponsored(
        [...distributePreIxs(), ix],
        connection,
        wallet,
        SPONSOR_WALLET,
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
        title: name
          ? t("card.toast.bonus_title.named", { name })
          : t("card.toast.bonus_title.fallback"),
        countUpUsd: bonusUsd > 0 ? bonusUsd : undefined,
        subtitle: t("card.toast.bonus_subtitle"),
      });
      onMutated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already been processed")) {
        onMutated();
        return;
      }
      if (msg.includes("BonusPeriodNotEnded") || msg.includes("PeriodNotEnded"))
        setError(t("card.error.bonus_not_ready"));
      else if (
        msg.includes("BonusAlreadyPaid") ||
        msg.includes("BonusAlreadyClaimed")
      )
        setError(t("card.error.bonus_already"));
      else if (msg.includes("BelowDustThreshold"))
        setError(t("card.error.no_yield"));
      else if (msg.includes("VaultPaused")) setError(t("card.error.paused"));
      else setError(msg);
    } finally {
      setSubmitting(null);
    }
  };

  const openEdit = () => {
    setEditName(name ?? "");
    setEditPix(getKidPixKey(familyKey) ?? "");
    setEditMonthly(
      (Number(family.streamRate.toString()) / 1_000_000).toFixed(0)
    );
    setEditError(null);
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (submitting) return;

    // Validate Pix key (if non-empty). Mirrors AddKidForm logic — same
    // detector + same validators.
    const pixTrimmed = editPix.trim();
    if (pixTrimmed.length > 0) {
      let pixOk = true;
      if (pixTrimmed.includes("@")) pixOk = isValidEmail(pixTrimmed);
      else if (pixTrimmed.startsWith("+")) {
        const digits = pixTrimmed.slice(1).replace(/\D/g, "");
        pixOk = digits.length >= 10 && digits.length <= 15;
      } else {
        pixOk = isValidCpf(pixTrimmed);
      }
      if (!pixOk) {
        setEditError(t("card.edit.error.pix"));
        return;
      }
    }

    // Validate monthly (required, in [1, 100_000]).
    const monthlyNum = parseFloat(editMonthly);
    if (
      !Number.isFinite(monthlyNum) ||
      monthlyNum < 1 ||
      monthlyNum > 100_000
    ) {
      setEditError(t("card.edit.error.monthly"));
      return;
    }

    setEditError(null);
    setSubmitting("edit");

    try {
      // 1. On-chain update if monthly changed AND the family is real.
      // Drafts haven't hit the chain yet — we just update the localStorage
      // record and the new value will be passed to create_family at the
      // moment of first deposit.
      const newRateBaseUnits = BigInt(Math.round(monthlyNum * 1_000_000));
      const currentRateBaseUnits = BigInt(family.streamRate.toString());
      if (newRateBaseUnits !== currentRateBaseUnits) {
        if (family.isDraft) {
          updateDraftMonthly(
            family.parent.toBase58(),
            family.kid.toBase58(),
            monthlyNum
          );
        } else {
          const ix = client.createSetStreamRateInstruction({
            feePayer: SPONSOR_WALLET,
            parent,
            familyPosition: family.pubkey,
            vaultConfig: DEVNET_ADDRESSES.vaultConfig,
            newStreamRate: newRateBaseUnits,
          });
          const sig = await sendQuasarIxSponsored(
            ix,
            connection,
            wallet,
            SPONSOR_WALLET,
            { commitment: "confirmed" }
          );
          console.log(`[set_stream_rate] tx ${sig}`);
        }
      }

      // 2. Off-chain updates (idempotent — safe to call even if unchanged).
      const trimmedName = editName.trim();
      if (trimmedName) setKidName(familyKey, trimmedName);
      else removeKidName(familyKey);

      if (pixTrimmed) setKidPixKey(familyKey, pixTrimmed);
      else removeKidPixKey(familyKey);

      setName(trimmedName || null);
      setPixKey(pixTrimmed || null);
      setEditing(false);
      showToast({
        variant: "monthly",
        title: t("card.edit.toast.title"),
        subtitle: t("card.edit.toast.subtitle"),
      });
      onMutated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setEditError(msg);
    } finally {
      setSubmitting(null);
    }
  };

  const handleRemove = async () => {
    if (submitting) return;
    if (
      !window.confirm(
        name
          ? t("card.remove_confirm.named", { name })
          : t("card.remove_confirm.unnamed")
      )
    )
      return;

    // Draft families never went on-chain — sponsor never paid for the
    // PDAs, so removal is purely a localStorage delete. Skip the close
    // tx entirely; it would fail (no FamilyPosition account exists).
    if (family.isDraft) {
      removeDraftFamily(family.parent.toBase58(), family.kid.toBase58());
      removeKidName(familyKey);
      removeKidPixKey(familyKey);
      removeSavingsGoal(familyKey);
      showToast({
        variant: "info",
        title: name
          ? t("card.toast.closed_title.named", { name })
          : t("card.toast.closed_title.fallback"),
        subtitle: t("card.toast.closed_subtitle"),
      });
      setClosing(true);
      setTimeout(() => onMutated(), 600);
      return;
    }

    setSubmitting("remove");
    setError(null);
    try {
      const parentUsdcAta = getAssociatedTokenAddressSync(
        DEVNET_ADDRESSES.usdcMint,
        parent
      );
      const kidView = deriveKidViewPda(parent, family.kid);
      const ataIx = createAssociatedTokenAccountIdempotentInstruction(
        SPONSOR_WALLET,
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
      const sig = await sendQuasarIxSponsored(
        [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
          ataIx,
          closeIx,
        ],
        connection,
        wallet,
        SPONSOR_WALLET,
        { commitment: "confirmed" }
      );
      // Soft fade-out of the card itself BEFORE removal. localStorage is
      // wiped immediately (cheap), but onMutated is delayed to let the
      // CSS transition play — reads as a quiet farewell, not a hard pop.
      removeKidName(familyKey);
      removeSavingsGoal(familyKey);
      showToast({
        variant: "info",
        title: name
          ? t("card.toast.closed_title.named", { name })
          : t("card.toast.closed_title.fallback"),
        subtitle: t("card.toast.closed_subtitle"),
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
          // Wrap on narrow viewports — the 38px italic name + the
          // "awaiting first deposit" / "annual plan" badge fight for the
          // same row at <360-ish px, and the badge ends up clipped or
          // overlapping the name. Letting the right column drop below
          // is cleaner than shrinking either.
          flexWrap: "wrap",
        }}
      >
        <div className="dash-col" style={{ flex: "1 1 200px", minWidth: 0 }}>
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
              title={t("card.rename.tooltip")}
            >
              {name ?? t("card.unnamed")}
            </h2>
          )}
          <div
            className="dash-row"
            style={{ alignItems: "center", gap: 8, marginTop: 8 }}
          >
            {pixKey ? (
              <span
                className="dash-mono"
                style={{ fontSize: 11, color: "var(--ink-3)" }}
                title={t("card.pix.label")}
              >
                ⚡ {formatPixKeyForDisplay(pixKey)}
              </span>
            ) : (
              <button
                className="dash-btn-link"
                style={{ padding: 0, fontSize: 11, color: "var(--ink-3)" }}
                onClick={openEdit}
              >
                {t("card.pix.empty")}
              </button>
            )}
          </div>
        </div>
        <div className="dash-col" style={{ alignItems: "flex-end", gap: 6 }}>
          <span
            className="dash-mono"
            style={{
              fontSize: 10,
              color: family.isDraft ? "#7A5A1F" : "var(--forest)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "4px 8px",
              border: family.isDraft
                ? "1px solid rgba(197, 148, 74, 0.4)"
                : "1px solid var(--forest-soft)",
              borderRadius: 99,
              background: family.isDraft
                ? "rgba(197, 148, 74, 0.18)"
                : "var(--forest-soft)",
              whiteSpace: "nowrap",
            }}
            title={family.isDraft ? t("card.draft.deposit_hint") : undefined}
          >
            {family.isDraft
              ? t("card.draft.badge")
              : t(`mode.${depositMode}.plan` as TranslationKey)}
          </span>
          <span
            className="dash-mono"
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              whiteSpace: "nowrap",
            }}
          >
            {t("card.created_ago", { ago: fmtAgo(now - createdAtSec) })}
          </span>
        </div>
      </div>

      {/* Stat row */}
      <div
        style={{
          display: "grid",
          // Auto-fit so 4 columns fit on wide viewports (~480px+ available
          // for this row) but collapse to 2 on phones. minmax(120px, 1fr)
          // means each column wants at least 120px; at <480 we get 2x2.
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: 20,
          padding: "24px 0",
          marginTop: 24,
          borderTop: "1px solid var(--line-soft)",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <StatCell
          label={t("card.stat.stream")}
          value={t("card.stat.stream_value", { amount: streamUsd.toFixed(0) })}
          sub={t("card.stat.stream_sub")}
        />
        <StatCell
          label={t("card.stat.principal")}
          value={fmtUSD(principalUsd)}
          sub={t("card.stat.principal_sub")}
        />
        <StatCell
          label={t("card.stat.shares")}
          value={fmtShares(sharesInt)}
          sub={t("card.stat.shares_sub")}
        />
        <StatCell
          label={t("card.stat.yield")}
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
          {t("card.last_paid", { ago: fmtAgo(now - lastDistSec) })}
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
          {t("card.share_link")}
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
          {t("card.copy_link")}
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
          {t("card.kids_page")} <ArrowUR />
        </a>
      </div>

      {/* Action buttons — grouped by intent so non-crypto parents can
          parse the layout at a glance:
            Row 1 (full width)     primary CTA — deposit (parent's wallet → kid's vault)
            Row 2 (50/50)          exit alternatives — Pix off-ramp + USDC withdraw
            Divider
            Row 3 (50/50)          automated distributions — monthly + bonus
          The two top-up actions (Pix on-ramp + USDC top-up) live on the
          dashboard header now, not per-card, since they fund the parent's
          wallet which is shared across all kids. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          marginTop: 24,
        }}
      >
        {/* Row 1 — primary deposit, full width. justifyContent:center
            so the "+ deposit" label sits in the middle of the button
            instead of left-aligning against the wide green slab. */}
        <button
          className="dash-btn dash-btn-primary"
          onClick={() => {
            setShowWithdraw(false);
            setShowDeposit((v) => !v);
          }}
          disabled={submitting !== null}
          style={{ width: "100%", justifyContent: "center" }}
        >
          <Plus /> {t("card.deposit")}
        </button>

        {/* Row 2 — exit alternatives. Pix off-ramp on the left,
            USDC withdraw on the right. Both are kid-vault → out flows. */}
        <div className="dash-btn-row">
          <button
            className="dash-btn dash-btn-ghost"
            disabled
            aria-label="Pix withdrawal coming soon"
            title="Pix integration coming soon"
          >
            {locale === "pt-BR" ? <PixLogo /> : <MoonPayLogo />}{" "}
            {t("card.withdraw_pix")}
            <span
              style={{
                marginLeft: 8,
                padding: "2px 8px",
                fontSize: 11,
                fontFamily: "var(--font-jetbrains-mono), monospace",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                border: "1px dashed #c5613a",
                borderRadius: 4,
                color: "#c5613a",
              }}
            >
              {t("card.soon")}
            </span>
          </button>
          <button
            className="dash-btn dash-btn-ghost"
            disabled={family.shares.isZero() || submitting !== null}
            onClick={() => {
              setShowDeposit(false);
              setShowPixOfframp(false);
              setShowWithdraw((v) => !v);
            }}
          >
            <span aria-hidden="true">💸</span> {t("card.withdraw")}
          </button>
        </div>

        {/* Divider — visually separates parent-initiated actions from
            keeper-driven (or parent-pressed-during-demo) automated
            distribution timers. */}
        <div
          style={{
            height: 1,
            background: "var(--line-soft)",
            margin: "6px 0",
          }}
          aria-hidden="true"
        />

        {/* Row 4 — automated distributions */}
        <div className="dash-btn-row">
          <button
            className={`dash-btn ${
              monthlyReady ? "dash-btn-ghost" : "dash-btn-disabled-state"
            }`}
            disabled={!monthlyReady || submitting !== null}
            onClick={handleMonthly}
            title={
              monthlyReady
                ? t("card.tip.send_monthly")
                : t("card.tip.available_in", {
                    countdown: fmtCountdown(monthlySecondsLeft),
                  })
            }
          >
            {submitting === "monthly"
              ? t("card.sending")
              : monthlyReady
              ? t("card.send_monthly")
              : t("card.monthly_in", {
                  countdown: fmtCountdown(monthlySecondsLeft),
                })}
          </button>
          <button
            className={`dash-btn ${
              bonusReady ? "dash-btn-ghost" : "dash-btn-disabled-state"
            }`}
            disabled={!bonusReady || submitting !== null}
            onClick={handleBonus}
            title={
              bonusReady
                ? t("card.tip.send_bonus")
                : vaultClock
                ? t("card.tip.available_in", {
                    countdown: fmtCountdown(bonusSecondsLeft),
                  })
                : t("card.tip.loading")
            }
          >
            <span aria-hidden="true">🎁</span>{" "}
            {submitting === "bonus"
              ? t("card.sending")
              : bonusReady
              ? t("card.send_bonus")
              : vaultClock
              ? t("card.bonus_in", {
                  countdown: fmtCountdown(bonusSecondsLeft),
                })
              : t("card.bonus_loading")}
          </button>
        </div>
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

      {showPixOfframp && (
        <div style={{ marginTop: 16 }}>
          <PixOfframpForm
            connection={connection}
            parent={parent}
            family={family}
            onCancel={() => setShowPixOfframp(false)}
            onWithdrawn={() => {
              setShowPixOfframp(false);
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
                  {t("card.cadence_topup_eyebrow", {
                    plan: t(`mode.${depositMode}.plan` as TranslationKey),
                  })}
                </span>
                <span
                  className="dash-serif"
                  style={{
                    fontSize: 22,
                    color: "var(--forest-deep)",
                    letterSpacing: "-0.005em",
                  }}
                >
                  {t("card.cadence_topup_title", {
                    amount: expectedDeposit.toFixed(2),
                  })}
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
                {t("card.cadence_topup_cta")}
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
            {t("card.goals.label")}
          </span>
          <span
            className="dash-mono"
            style={{
              fontSize: 10,
              color: "var(--ink-3)",
              letterSpacing: "0.04em",
            }}
          >
            {t("card.goals.active_count", { n: goals.length })}
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
              {t("card.goals.add_another")}
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

      {/* Edit panel */}
      {editing && (
        <div
          className="dash-card"
          style={{
            marginTop: 24,
            padding: "24px 28px",
            background: "var(--stone-2)",
          }}
        >
          <div
            className="dash-row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 18,
            }}
          >
            <span className="dash-eyebrow">
              <span className="rule" /> {t("card.edit.eyebrow")}
            </span>
            <button
              className="dash-btn-link"
              onClick={() => {
                setEditing(false);
                setEditError(null);
              }}
            >
              {t("card.edit.close")}
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 16,
            }}
          >
            <div className="dash-col">
              <label className="dash-field-label">
                {t("card.edit.name.label")}
              </label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t("card.edit.name.placeholder")}
              />
            </div>
            <div className="dash-col">
              <label className="dash-field-label">
                {t("card.edit.pix.label")}
              </label>
              <input
                className="dash-mono-input"
                value={editPix}
                onChange={(e) => setEditPix(e.target.value)}
                placeholder={t("card.edit.pix.placeholder")}
              />
            </div>
            <div className="dash-col">
              <label className="dash-field-label">
                {t("card.edit.monthly.label")}
              </label>
              <input
                className="dash-mono-input"
                type="number"
                min={1}
                max={100_000}
                value={editMonthly}
                onChange={(e) => setEditMonthly(e.target.value)}
              />
            </div>
          </div>
          {editError && (
            <span
              className="dash-mono"
              style={{
                fontSize: 11,
                color: "var(--rose)",
                marginTop: 12,
                display: "block",
              }}
            >
              {editError}
            </span>
          )}
          <div
            className="dash-row"
            style={{ justifyContent: "flex-end", gap: 12, marginTop: 18 }}
          >
            <button
              className="dash-btn dash-btn-primary"
              onClick={handleSaveEdit}
              disabled={submitting !== null}
            >
              {submitting === "edit"
                ? t("card.edit.saving")
                : t("card.edit.save")}
            </button>
          </div>
        </div>
      )}

      {/* Edit + Remove */}
      <div
        className="dash-row"
        style={{
          marginTop: 28,
          justifyContent: "flex-end",
          gap: 16,
        }}
      >
        {!editing && (
          <button
            className="dash-btn-link"
            onClick={openEdit}
            disabled={submitting !== null}
          >
            {t("card.edit_kid")}
          </button>
        )}
        <button
          className="dash-btn-link dash-btn-link-danger"
          onClick={handleRemove}
          disabled={submitting !== null}
        >
          {submitting === "remove" ? t("card.removing") : t("card.remove_kid")}
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
