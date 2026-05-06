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
import { useWallet } from "@solana/wallet-adapter-react";
import { useRef, useState } from "react";
import type { Connection } from "@solana/web3.js";
import { DEVNET_ADDRESSES } from "@/lib/program";
import { SeedlingQuasarClient } from "@/lib/quasar-client";
import { sendQuasarIx } from "@/lib/sendQuasarIx";
import { celebrateDeposit } from "@/lib/celebrate";
import { useToast } from "@/components/Toast";
import { useLocale } from "@/lib/i18n";
import type { FamilyView } from "@/lib/fetchFamilies";

const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);

const MAX_DEPOSIT_USD = 10_000;

type Props = {
  connection: Connection;
  parent: PublicKey;
  family: FamilyView;
  onDeposited: () => void;
  onCancel: () => void;
};

export function DepositForm({
  connection,
  parent,
  family,
  onDeposited,
  onCancel,
}: Props) {
  const wallet = useWallet();
  const client = new SeedlingQuasarClient();
  const { showToast } = useToast();
  const { t, locale } = useLocale();
  // Form ref so confetti can fire FROM the family card (not screen-center).
  // Captured before onDeposited unmounts us.
  const formRef = useRef<HTMLFormElement>(null);
  const [amountInput, setAmountInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const amountNum = parseFloat(amountInput);
  let amountError: string | null = null;
  if (!amountInput.trim()) {
    amountError = null;
  } else if (Number.isNaN(amountNum) || !Number.isFinite(amountNum)) {
    amountError = t("deposit.error.amount_required");
  } else if (amountNum <= 0) {
    amountError = t("deposit.error.amount_positive");
  } else if (amountNum > MAX_DEPOSIT_USD) {
    amountError = t("deposit.error.amount_max", {
      max: MAX_DEPOSIT_USD.toLocaleString(),
    });
  }

  const submitDisabled =
    submitting || !amountInput.trim() || amountError !== null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const amountBaseUnits = Math.round(amountNum * 1_000_000);

      const depositorUsdcAta = getAssociatedTokenAddressSync(
        DEVNET_ADDRESSES.usdcMint,
        parent
      );

      const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("lma"), DEVNET_ADDRESSES.kaminoMarket.toBuffer()],
        DEVNET_ADDRESSES.klendProgram
      );

      const ataIx = createAssociatedTokenAccountIdempotentInstruction(
        parent,
        depositorUsdcAta,
        parent,
        DEVNET_ADDRESSES.usdcMint
      );

      const depositIx = client.createDepositInstruction({
        familyPosition: family.pubkey,
        depositor: parent,
        depositorUsdcAta,
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
        amount: BigInt(amountBaseUnits),
        minSharesOut: BigInt(0),
      });

      const sig = await sendQuasarIx(
        [
          ComputeBudgetProgram.setComputeUnitLimit({ units: 800_000 }),
          ataIx,
          depositIx,
        ],
        connection,
        wallet,
        { commitment: "finalized" }
      );
      console.log(`[deposit] tx ${sig}`);

      // Celebrate: confetti at the family card's location + toast with the
      // amount. Capture origin BEFORE onDeposited unmounts the form.
      const origin = computeOrigin(formRef.current);
      void celebrateDeposit(origin);
      showToast({
        variant: "monthly", // reuse the green-palette toast variant
        title: t("deposit.toast.title"),
        countUpUsd: amountNum,
        subtitle: t("deposit.toast.subtitle"),
      });
      onDeposited();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // "already been processed" = duplicate submission of a tx that already
      // landed. Anchor retries internally; the tx succeeded once, so treat
      // this as success rather than spooking the user.
      if (msg.toLowerCase().includes("already been processed")) {
        console.log("[deposit] duplicate submission — first tx succeeded");
        const origin = computeOrigin(formRef.current);
        void celebrateDeposit(origin);
        showToast({
          variant: "monthly",
          title: t("deposit.toast.title"),
          countUpUsd: amountNum,
          subtitle: t("deposit.toast.subtitle"),
        });
        onDeposited();
        return;
      }
      if (msg.includes("0x1") && msg.toLowerCase().includes("custom")) {
        setSubmitError(t("deposit.error.insufficient_usdc"));
      } else if (
        msg.toLowerCase().includes("insufficient funds") ||
        msg.toLowerCase().includes("0x1")
      ) {
        setSubmitError(t("deposit.error.insufficient"));
      } else if (msg.includes("VaultPaused")) {
        setSubmitError(t("deposit.error.paused"));
      } else if (msg.includes("SlippageExceeded")) {
        setSubmitError(t("deposit.error.slippage"));
      } else if (
        // Phantom returns "Unexpected error" sometimes AFTER the tx has
        // landed — wallet-adapter timing issue. Refetch and let the
        // dashboard show actual state instead of a misleading error.
        msg.toLowerCase().includes("unexpected error") ||
        msg.toLowerCase().includes("wallet rejected: unexpected")
      ) {
        console.log(
          "[deposit] wallet returned generic error — refetching to check actual state"
        );
        onDeposited();
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
      className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-4 flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-emerald-900">
          {t("deposit.title")}
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
          <span className="text-stone-500">$</span>
          <input
            type="number"
            min="0"
            max={MAX_DEPOSIT_USD}
            step="0.01"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="100.00"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm w-32 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            autoFocus
          />
          <span className="text-sm text-stone-500">USDC</span>
        </div>
        {amountError && (
          <span className="text-xs text-red-700">{amountError}</span>
        )}
        {/* PT-BR-only USDC≠BRL clarifier (Brazilian users read "$" as R$). */}
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

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-stone-500">
          {t("add_kid.faucets.label")}{" "}
          <a
            href="https://solfaucet.com"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-stone-700"
          >
            SOL
          </a>
          {" → "}
          <a
            href="https://faucet.circle.com/?token=USDC&blockchain=SOL"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-stone-700"
          >
            USDC
          </a>
        </span>
        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-full bg-lime-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting
            ? t("deposit.button.confirming")
            : t("deposit.button.submit")}
        </button>
      </div>
    </form>
  );
}

/** Convert an element's bounding rect to canvas-confetti's normalized
 *  [0..1] viewport coordinates. Returns the element's center, biased
 *  slightly upward so the burst spreads OVER the card rather than
 *  behind/below it. Falls back to upper-center on null. */
function computeOrigin(el: HTMLElement | null): { x: number; y: number } {
  if (!el || typeof window === "undefined") {
    return { x: 0.5, y: 0.4 };
  }
  const r = el.getBoundingClientRect();
  return {
    x: (r.left + r.width / 2) / window.innerWidth,
    y: (r.top + r.height * 0.3) / window.innerHeight,
  };
}
