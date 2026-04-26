"use client";

import { BN } from "@coral-xyz/anchor";
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
import { useState } from "react";
import type { Connection } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import { DEVNET_ADDRESSES } from "@/lib/program";
import type { FamilyView } from "@/lib/fetchFamilies";
import type { Seedling } from "@/lib/types";

const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);

// Sanity cap. Program does not enforce; this is just to catch fat-finger
// "$50000" typos before they hit a wallet popup.
const MAX_DEPOSIT_USD = 10_000;

type Props = {
  program: Program<Seedling>;
  connection: Connection;
  parent: PublicKey;
  family: FamilyView;
  onDeposited: () => void;
  onCancel: () => void;
};

export function DepositForm({
  program,
  connection,
  parent,
  family,
  onDeposited,
  onCancel,
}: Props) {
  const [amountInput, setAmountInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const amountNum = parseFloat(amountInput);
  let amountError: string | null = null;
  if (!amountInput.trim()) {
    amountError = null;
  } else if (Number.isNaN(amountNum) || !Number.isFinite(amountNum)) {
    amountError = "must be a number";
  } else if (amountNum <= 0) {
    amountError = "must be positive";
  } else if (amountNum > MAX_DEPOSIT_USD) {
    amountError = `max $${MAX_DEPOSIT_USD.toLocaleString()} per deposit`;
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
      const amount = new BN(amountBaseUnits);

      const parentUsdcAta = getAssociatedTokenAddressSync(
        DEVNET_ADDRESSES.usdcMint,
        parent
      );

      const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("lma"), DEVNET_ADDRESSES.kaminoMarket.toBuffer()],
        DEVNET_ADDRESSES.klendProgram
      );

      // Idempotent ATA create — no-ops if it already exists. Cheap insurance
      // for first-time wallets that never touched devnet USDC.
      const ataIx = createAssociatedTokenAccountIdempotentInstruction(
        parent,
        parentUsdcAta,
        parent,
        DEVNET_ADDRESSES.usdcMint
      );

      // Account ordering mirrors scripts/devnet-deposit-smoke.ts (verified
      // working on devnet). KLEND program ID is the sentinel for unused
      // oracle slots — Anchor's Option<AccountInfo> "None" encoding.
      const sig = await program.methods
        .deposit(amount, new BN(0))
        .accountsPartial({
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
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .preInstructions([
          ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }),
          ataIx,
        ])
        .rpc({ commitment: "confirmed" });

      // Wait for finalization so the immediate refetch sees the new
      // family state, not a stale snapshot. confirmTransaction is
      // correct under any latency; setTimeout was a known-stale mask.
      await connection.confirmTransaction(sig, "finalized");
      console.log(`[deposit] tx ${sig}`);

      onDeposited();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // "already been processed" = duplicate submission of a tx that already
      // landed. Anchor retries internally; the tx succeeded once, so treat
      // this as success rather than spooking the user.
      if (msg.toLowerCase().includes("already been processed")) {
        console.log("[deposit] duplicate submission — first tx succeeded");
        onDeposited();
        return;
      }
      if (msg.includes("0x1") && msg.toLowerCase().includes("custom")) {
        setSubmitError("Insufficient devnet USDC. Use the faucets below.");
      } else if (
        msg.toLowerCase().includes("insufficient funds") ||
        msg.toLowerCase().includes("0x1")
      ) {
        setSubmitError("Insufficient SOL or USDC. Check the faucets below.");
      } else if (msg.includes("VaultPaused")) {
        setSubmitError("The vault is paused. Try again later.");
      } else if (msg.includes("SlippageExceeded")) {
        setSubmitError("Share price moved during deposit. Try again.");
      } else {
        setSubmitError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-4 flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-emerald-900">Deposit USDC</h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-stone-500 hover:text-stone-700"
        >
          cancel
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
      </div>

      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-stone-500">
          Need devnet USDC?{" "}
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
          {submitting ? "Confirming…" : "Deposit"}
        </button>
      </div>
    </form>
  );
}
