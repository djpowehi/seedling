"use client";

// Withdraw to Pix in a single signed transaction. The parent enters a
// USDC amount + their Pix key; we orchestrate:
//
//   1. Server-side: read vault state, compute shares to burn for that
//      USDC amount (with 2% buffer), call 4P to get receiver_wallet.
//   2. Client-side: build ONE transaction containing
//        [computeBudget, withdraw, ata-create-receiver, transferChecked]
//      Parent signs once → withdraw produces USDC in their ATA, the
//      same tx forwards it to 4P, 4P delivers Pix to their bank.
//
// The "automatic" requirement Vicenzo flagged: zero polling, zero
// follow-up clicks. The whole flow lives behind one wallet signature.

import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import type { Connection } from "@solana/web3.js";
import { useSeedlingWallet } from "@/lib/wallet";
import { useEffect, useRef, useState } from "react";

import { celebrateMonthly } from "@/lib/celebrate";
import { useToast } from "@/components/Toast";
import { useLocale } from "@/lib/i18n";
import { DEVNET_ADDRESSES } from "@/lib/program";
import { SeedlingQuasarClient } from "@/lib/quasar-client";
import { sendQuasarIx } from "@/lib/sendQuasarIx";
import {
  clearPixProfile,
  formatCpfForDisplay,
  getPixProfile,
  isValidCpf,
  isValidEmail,
  setPixProfile,
} from "@/lib/pixProfile";
import type { FamilyView } from "@/lib/fetchFamilies";

const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);

const MIN_USDC = 1;
const MAX_USDC = 5000;

type Props = {
  connection: Connection;
  parent: PublicKey;
  family: FamilyView;
  onWithdrawn: () => void;
  onCancel: () => void;
};

interface OfframpQuote {
  sharesToBurn: string;
  minAssetsOut: string;
  receiverWallet: string;
  amountBrl: number;
  txid: string;
  customId: string;
  expiresAtUnix: number;
}

export function PixOfframpForm({
  connection,
  parent,
  family,
  onWithdrawn,
  onCancel,
}: Props) {
  const wallet = useSeedlingWallet();
  const client = new SeedlingQuasarClient();
  const { showToast } = useToast();
  const { t, locale } = useLocale();
  const formRef = useRef<HTMLFormElement>(null);

  const parentKey = parent.toBase58();

  const [storedProfile, setStoredProfile] = useState<{
    cpf: string;
    email: string;
  } | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  const [amountInput, setAmountInput] = useState("");
  const [pixKeyInput, setPixKeyInput] = useState("");
  const [cpfInput, setCpfInput] = useState("");
  const [emailInput, setEmailInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ amountBrl: number } | null>(null);

  useEffect(() => {
    const p = getPixProfile(parentKey);
    if (p) setStoredProfile(p);
    else setEditingProfile(true);
  }, [parentKey]);

  const hasProfile = storedProfile !== null && !editingProfile;
  const cpfForRequest = hasProfile ? storedProfile.cpf : cpfInput;
  const emailForRequest = hasProfile ? storedProfile.email : emailInput;

  const amountNum = parseFloat(amountInput);
  let amountError: string | null = null;
  if (!amountInput.trim()) {
    amountError = null;
  } else if (Number.isNaN(amountNum) || !Number.isFinite(amountNum)) {
    amountError = t("withdraw.error.amount_required");
  } else if (amountNum < MIN_USDC) {
    amountError = t("pix.amount.error.min", { min: MIN_USDC });
  } else if (amountNum > MAX_USDC) {
    amountError = t("pix.amount.error.max", { max: MAX_USDC.toLocaleString() });
  }

  const profileError = hasProfile
    ? null
    : cpfInput && !isValidCpf(cpfInput)
    ? t("pix.profile.error.cpf")
    : emailInput && !isValidEmail(emailInput)
    ? t("pix.profile.error.email")
    : null;

  const submitDisabled =
    submitting ||
    !amountInput.trim() ||
    amountError !== null ||
    !pixKeyInput.trim() ||
    profileError !== null ||
    (!hasProfile && (!isValidCpf(cpfInput) || !isValidEmail(emailInput)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled || !wallet.publicKey) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // 1. Hit /api/4p/offramp — this both reads on-chain state to
      //    compute shares + creates the 4P order. One round-trip.
      const res = await fetch("/api/4p/offramp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          familyPda: family.pubkey.toBase58(),
          parentPubkey: parentKey,
          amountUsdc: amountNum,
          destinationPixKey: pixKeyInput.trim(),
          cpf: cpfForRequest.replace(/\D/g, ""),
          email: emailForRequest,
        }),
      });
      const json = (await res.json()) as OfframpQuote | { error: string };
      if (!res.ok || "error" in json) {
        const msg = "error" in json ? json.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      // Persist profile only after 4P accepts (same pattern as PixDepositForm).
      if (!hasProfile) {
        const cleaned = {
          cpf: cpfInput.replace(/\D/g, ""),
          email: emailInput,
        };
        setPixProfile(parentKey, cleaned);
        setStoredProfile(cleaned);
        setEditingProfile(false);
      }

      // 2. Build the combined transaction — withdraw + transfer to 4P.
      const sharesToBurn = BigInt(json.sharesToBurn);
      const minAssetsOut = BigInt(json.minAssetsOut);
      const amountBaseUnits = minAssetsOut; // exact requested amount

      const parentUsdcAta = getAssociatedTokenAddressSync(
        DEVNET_ADDRESSES.usdcMint,
        parent
      );

      const receiverWallet = new PublicKey(json.receiverWallet);
      const receiverUsdcAta = getAssociatedTokenAddressSync(
        DEVNET_ADDRESSES.usdcMint,
        receiverWallet,
        // 4P's wallet may be a PDA owned by their program; allow off-curve
        // owners so the ATA derivation doesn't reject. If it's a normal
        // wallet, off-curve also works — strict superset.
        true
      );

      const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("lma"), DEVNET_ADDRESSES.kaminoMarket.toBuffer()],
        DEVNET_ADDRESSES.klendProgram
      );

      // Idempotent ATA-creates: ensure both parent's USDC ATA and 4P's
      // USDC ATA exist before the transfer. createAssociatedTokenAccount
      // can be called with payer ≠ owner — payer just covers rent.
      const parentAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        parent,
        parentUsdcAta,
        parent,
        DEVNET_ADDRESSES.usdcMint
      );
      const receiverAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        parent,
        receiverUsdcAta,
        receiverWallet,
        DEVNET_ADDRESSES.usdcMint
      );

      const withdrawIx = client.createWithdrawInstruction({
        familyPosition: family.pubkey,
        parent,
        parentUsdcAta,
        vaultUsdcAta: DEVNET_ADDRESSES.vaultUsdcAta,
        vaultCtokenAta: DEVNET_ADDRESSES.vaultCtokenAta,
        treasuryUsdcAta: DEVNET_ADDRESSES.treasury,
        vaultConfig: DEVNET_ADDRESSES.vaultConfig,
        usdcMint: DEVNET_ADDRESSES.usdcMint,
        ctokenMint: DEVNET_ADDRESSES.ctokenMint,
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
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        sharesToBurn,
        minAssetsOut,
      });

      const transferIx = createTransferCheckedInstruction(
        parentUsdcAta,
        DEVNET_ADDRESSES.usdcMint,
        receiverUsdcAta,
        parent,
        amountBaseUnits,
        6
      );

      const sig = await sendQuasarIx(
        [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
          parentAtaIx,
          receiverAtaIx,
          withdrawIx,
          transferIx,
        ],
        connection,
        wallet,
        { commitment: "confirmed" }
      );
      console.log(`[offramp] tx ${sig}`);

      celebrateMonthly();
      showToast({
        variant: "monthly",
        title: t("pix.offramp.toast.title"),
        countUpUsd: json.amountBrl,
        subtitle: t("pix.offramp.toast.subtitle", {
          amount: json.amountBrl.toFixed(2),
        }),
      });

      setSuccess({ amountBrl: json.amountBrl });
      // Beat for the celebration, then close.
      setTimeout(() => onWithdrawn(), 1800);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("not authorized") || msg.includes("Incorrect Api")) {
        setSubmitError(t("pix.error.not_authorized"));
      } else if (msg.includes("SlippageExceeded")) {
        setSubmitError(t("pix.offramp.error.slippage"));
      } else if (msg.includes("VaultPaused")) {
        setSubmitError(t("pix.offramp.error.paused"));
      } else {
        setSubmitError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-4 flex flex-col items-center gap-2">
        <span className="text-2xl">✅</span>
        <span className="text-sm font-medium text-emerald-900">
          {t("pix.offramp.success", {
            amount: success.amountBrl.toFixed(2),
          })}
        </span>
        <span className="text-xs text-stone-500">
          {t("pix.success.closing")}
        </span>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-4 flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-emerald-900">
          {t("pix.offramp.title")}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-stone-500 hover:text-stone-700"
        >
          {t("pix.cancel")}
        </button>
      </div>

      <p className="text-xs text-stone-600">{t("pix.offramp.body")}</p>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-stone-500">
          {t("pix.offramp.amount.label")}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-stone-500">$</span>
          <input
            type="number"
            min={MIN_USDC}
            max={MAX_USDC}
            step="0.01"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder={t("pix.offramp.amount.placeholder")}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm w-32 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            autoFocus
          />
          <span className="text-sm text-stone-500">USDC</span>
        </div>
        {amountError && (
          <span className="text-xs text-red-700">{amountError}</span>
        )}
        {/* PT-BR-only USDC≠BRL clarifier. */}
        {locale === "pt-BR" && (
          <span className="text-[11px] text-stone-500 font-mono">
            {t("currency.usdc_note")}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-stone-500">
          {t("pix.offramp.pixkey.label")}
        </span>
        <input
          type="text"
          value={pixKeyInput}
          onChange={(e) => setPixKeyInput(e.target.value)}
          placeholder={t("pix.offramp.pixkey.placeholder")}
          className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />
      </div>

      {hasProfile ? (
        <div className="flex items-center justify-between text-xs text-stone-600 rounded-lg border border-stone-200 bg-white px-3 py-2">
          <span>
            {t("pix.profile.from", {
              cpf: formatCpfForDisplay(storedProfile.cpf),
              email: storedProfile.email,
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              clearPixProfile(parentKey);
              setStoredProfile(null);
              setCpfInput("");
              setEmailInput("");
              setEditingProfile(true);
            }}
            className="text-stone-500 hover:text-stone-800 underline"
          >
            {t("pix.profile.change")}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-stone-500">
              {t("pix.profile.cpf")}
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={cpfInput}
              onChange={(e) => setCpfInput(e.target.value)}
              placeholder={t("pix.profile.cpf.placeholder")}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-stone-500">
              {t("pix.profile.email")}
            </span>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder={t("pix.profile.email.placeholder")}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          {profileError && (
            <span className="text-xs text-red-700">{profileError}</span>
          )}
          <span className="text-[11px] text-stone-500">
            {t("pix.profile.fine")}
          </span>
        </>
      )}

      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-full bg-lime-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? t("pix.offramp.submitting") : t("pix.offramp.submit")}
        </button>
      </div>
    </form>
  );
}
