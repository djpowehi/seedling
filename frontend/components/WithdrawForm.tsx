"use client";

import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import { useSeedlingWallet } from "@/lib/wallet";
import { useRef, useState } from "react";
import type { Connection } from "@solana/web3.js";
import { DEVNET_ADDRESSES, SPONSOR_WALLET } from "@/lib/program";
import { SeedlingQuasarClient } from "@/lib/quasar-client";
import { sendQuasarIxSponsored } from "@/lib/sendQuasarIx";
import { celebrateWithdraw } from "@/lib/celebrate";
import { useToast } from "@/components/Toast";
import { useLocale } from "@/lib/i18n";
import type { FamilyView } from "@/lib/fetchFamilies";

const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);

type Props = {
  connection: Connection;
  parent: PublicKey;
  family: FamilyView;
  onWithdrawn: () => void;
  onCancel: () => void;
};

export function WithdrawForm({
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
  // Form ref → confetti origin centered on the family card.
  const formRef = useRef<HTMLFormElement>(null);

  // Family-balance math. Both fields are raw u64 USDC base units.
  // principal + yield gives us "USDC value of this family's shares" at the
  // last harvest snapshot — close enough for input estimation; the program
  // does an authoritative refresh + computes against current state.
  const familyShares = BigInt(family.shares.toString());
  const principalBase = BigInt(family.principalRemaining.toString());
  const yieldBase = BigInt(family.totalYieldEarned.toString());
  const balanceBase = principalBase + yieldBase;
  const balanceUsd = Number(balanceBase) / 1_000_000;

  const [usdInput, setUsdInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const usdNum = parseFloat(usdInput);
  let usdError: string | null = null;
  if (!usdInput.trim()) {
    usdError = null;
  } else if (Number.isNaN(usdNum) || !Number.isFinite(usdNum)) {
    usdError = t("withdraw.error.amount_required");
  } else if (usdNum <= 0) {
    usdError = t("withdraw.error.amount_positive");
  } else if (usdNum > balanceUsd + 0.005) {
    // tiny epsilon so "$4.90" doesn't fail when the balance shows as 4.90
    // due to base-unit rounding to 6dp.
    usdError = t("withdraw.error.amount_max", { max: balanceUsd.toFixed(2) });
  }

  const submitDisabled =
    submitting ||
    !usdInput.trim() ||
    usdError !== null ||
    balanceBase === BigInt(0);

  /** Convert the user's USD intent into shares-to-burn at the
   *  current local-snapshot share price. Caps at family's full
   *  share balance to avoid over-burn from rounding. */
  const computeSharesToBurn = (usd: number): bigint => {
    if (balanceBase === BigInt(0)) return BigInt(0);
    const amountBase = BigInt(Math.round(usd * 1_000_000));
    if (amountBase >= balanceBase) return familyShares; // max-out
    const shares = (amountBase * familyShares) / balanceBase;
    return shares > familyShares ? familyShares : shares;
  };

  const previewShares =
    Number.isFinite(usdNum) && usdNum > 0
      ? computeSharesToBurn(usdNum)
      : BigInt(0);

  const setMax = () => setUsdInput(balanceUsd.toFixed(2));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // If the user typed effectively the full balance, just burn all
      // shares — avoids dust strands of 1-2 shares left behind by
      // rounding in the floor(usd * shares / balance) calculation.
      const sharesToBurn =
        Math.abs(usdNum - balanceUsd) < 0.005
          ? familyShares
          : computeSharesToBurn(usdNum);

      if (sharesToBurn === BigInt(0)) {
        setSubmitError(t("withdraw.error.too_small"));
        setSubmitting(false);
        return;
      }

      const parentUsdcAta = getAssociatedTokenAddressSync(
        DEVNET_ADDRESSES.usdcMint,
        parent
      );

      const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("lma"), DEVNET_ADDRESSES.kaminoMarket.toBuffer()],
        DEVNET_ADDRESSES.klendProgram
      );

      const ataIx = createAssociatedTokenAccountIdempotentInstruction(
        SPONSOR_WALLET,
        parentUsdcAta,
        parent,
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
        oracleScopeConfig: DEVNET_ADDRESSES.oracleScopeConfig,
        kaminoProgram: DEVNET_ADDRESSES.klendProgram,
        instructionSysvar: SYSVAR_INSTRUCTIONS,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        sharesToBurn,
        // No slippage floor — we'd rather receive 1-2 base units less than
        // bounce. Kamino's redeem can shave dust due to internal rounding.
        minAssetsOut: BigInt(0),
      });

      const sig = await sendQuasarIxSponsored(
        [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
          ataIx,
          withdrawIx,
        ],
        connection,
        wallet,
        SPONSOR_WALLET,
        { commitment: "finalized" }
      );
      console.log(`[withdraw] tx ${sig}`);

      // Celebrate at the family card's location + toast with the USD
      // amount counting up. Capture origin BEFORE onWithdrawn unmounts.
      const origin = computeWithdrawOrigin(formRef.current);
      void celebrateWithdraw(origin);
      showToast({
        variant: "monthly",
        title: t("withdraw.toast.title"),
        countUpUsd: usdNum,
        subtitle: t("withdraw.toast.subtitle"),
      });
      onWithdrawn();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already been processed")) {
        console.log("[withdraw] duplicate submission — first tx succeeded");
        const origin = computeWithdrawOrigin(formRef.current);
        void celebrateWithdraw(origin);
        showToast({
          variant: "monthly",
          title: t("withdraw.toast.title"),
          countUpUsd: usdNum,
          subtitle: t("withdraw.toast.subtitle"),
        });
        onWithdrawn();
        return;
      }
      if (msg.includes("InsufficientShares")) {
        setSubmitError(t("withdraw.error.insufficient_shares"));
      } else if (msg.includes("VaultPaused")) {
        setSubmitError(t("withdraw.error.paused"));
      } else if (msg.includes("SlippageExceeded")) {
        setSubmitError(t("withdraw.error.slippage"));
      } else if (msg.includes("BelowDustThreshold")) {
        setSubmitError(t("withdraw.error.dust"));
      } else if (
        // Phantom sometimes throws "Unexpected error" AFTER the tx has
        // actually landed — wallet-adapter timing issue. Refetch so the
        // dashboard reflects on-chain state; if the tx genuinely failed,
        // principal didn't move and the user can retry.
        msg.toLowerCase().includes("unexpected error") ||
        msg.toLowerCase().includes("wallet rejected: unexpected")
      ) {
        console.log(
          "[withdraw] wallet returned generic error — refetching to check actual state"
        );
        // Optimistically celebrate — common case is tx landed despite the
        // generic error (verified on the $4.90→$3.90 case).
        const origin = computeWithdrawOrigin(formRef.current);
        void celebrateWithdraw(origin);
        showToast({
          variant: "monthly",
          title: t("withdraw.toast.title_likely"),
          countUpUsd: usdNum,
          subtitle: t("withdraw.toast.subtitle_likely"),
        });
        onWithdrawn();
        return;
      } else {
        setSubmitError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="rounded-xl bg-stone-50 border border-stone-200 p-4 flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-emerald-900">
          {t("withdraw.title")}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-stone-500 hover:text-stone-700"
        >
          {t("generic.cancel")}
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-stone-500 text-sm">$</span>
          <input
            type="text"
            inputMode="decimal"
            value={usdInput}
            onChange={(e) =>
              // Allow digits + at most one decimal point; cap at 2 decimals.
              setUsdInput(
                e.target.value
                  .replace(/[^0-9.]/g, "")
                  .replace(/(\..*)\./g, "$1")
                  .replace(/^(\d*\.\d{2}).*$/, "$1")
              )
            }
            placeholder="0.00"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm w-32 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            autoFocus
          />
          <span className="text-sm text-stone-500">USDC</span>
          <button
            type="button"
            onClick={setMax}
            className="text-xs underline text-stone-600 hover:text-stone-800"
          >
            {t("withdraw.max_label", { balance: balanceUsd.toFixed(2) })}
          </button>
        </div>
        {usdError && <span className="text-xs text-red-700">{usdError}</span>}
        {balanceBase === BigInt(0) && (
          <span className="text-xs text-stone-500">
            {t("withdraw.no_balance")}
          </span>
        )}
        {!usdError && previewShares > BigInt(0) && balanceBase > BigInt(0) && (
          <span className="text-xs text-stone-500">
            {t("withdraw.preview", {
              shares: Number(previewShares).toLocaleString("en-US"),
              usd: usdNum.toFixed(2),
            })}
          </span>
        )}
        {/* PT-BR-only USDC≠BRL clarifier. */}
        {locale === "pt-BR" && (
          <span className="text-[11px] text-stone-500 font-mono">
            {t("currency.usdc_note")}
          </span>
        )}
      </div>

      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {submitError}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-full bg-stone-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? t("withdraw.button.confirming")
            : t("withdraw.button.submit")}
        </button>
      </div>
    </form>
  );
}

/** Convert the form's bounding rect into normalized [0..1] viewport
 *  coords for canvas-confetti. Slight upward bias so particles spread
 *  ABOVE the card. Falls back to upper-center on null. */
function computeWithdrawOrigin(el: HTMLElement | null): {
  x: number;
  y: number;
} {
  if (!el || typeof window === "undefined") {
    return { x: 0.5, y: 0.4 };
  }
  const r = el.getBoundingClientRect();
  return {
    x: (r.left + r.width / 2) / window.innerWidth,
    y: (r.top + r.height * 0.3) / window.innerHeight,
  };
}
