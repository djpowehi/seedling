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

type Props = {
  program: Program<Seedling>;
  connection: Connection;
  parent: PublicKey;
  family: FamilyView;
  onWithdrawn: () => void;
  onCancel: () => void;
};

export function WithdrawForm({
  program,
  connection,
  parent,
  family,
  onWithdrawn,
  onCancel,
}: Props) {
  const totalShares = BigInt(family.shares.toString());
  const [sharesInput, setSharesInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Shares-denominated input. USD-denom would require a live Kamino exchange-
  // rate read; deferred to a v2 once the share-price view is exposed on-chain.
  let sharesError: string | null = null;
  let parsedShares: bigint | null = null;
  if (sharesInput.trim()) {
    try {
      parsedShares = BigInt(sharesInput.trim());
      if (parsedShares <= BigInt(0)) {
        sharesError = "must be positive";
      } else if (parsedShares > totalShares) {
        sharesError = `max ${totalShares.toString()} shares`;
      }
    } catch {
      sharesError = "must be a whole number";
    }
  }

  const submitDisabled =
    submitting ||
    !sharesInput.trim() ||
    sharesError !== null ||
    totalShares === BigInt(0);

  const setMax = () => setSharesInput(totalShares.toString());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled || parsedShares === null) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const sharesToBurn = new BN(parsedShares.toString());

      const parentUsdcAta = getAssociatedTokenAddressSync(
        DEVNET_ADDRESSES.usdcMint,
        parent
      );

      const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("lma"), DEVNET_ADDRESSES.kaminoMarket.toBuffer()],
        DEVNET_ADDRESSES.klendProgram
      );

      const ataIx = createAssociatedTokenAccountIdempotentInstruction(
        parent,
        parentUsdcAta,
        parent,
        DEVNET_ADDRESSES.usdcMint
      );

      // Mirrors scripts/surfpool-withdraw-e2e.ts. Same Kamino account set as
      // deposit; only the program-side instruction differs.
      const sig = await program.methods
        .withdraw(sharesToBurn, new BN(0))
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

      await new Promise((resolve) => setTimeout(resolve, 1500));
      console.log(`[withdraw] tx ${sig}`);

      onWithdrawn();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Same Anchor-retry duplicate handling as DepositForm.
      if (msg.toLowerCase().includes("already been processed")) {
        console.log("[withdraw] duplicate submission — first tx succeeded");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        onWithdrawn();
        return;
      }
      if (msg.includes("InsufficientShares")) {
        setSubmitError("Not enough shares to withdraw that amount.");
      } else if (msg.includes("VaultPaused")) {
        setSubmitError("The vault is paused. Try again later.");
      } else if (msg.includes("SlippageExceeded")) {
        setSubmitError("Share price moved during withdraw. Try again.");
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
      className="rounded-xl bg-stone-50 border border-stone-200 p-4 flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-emerald-900">Withdraw</h3>
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
          <input
            type="text"
            inputMode="numeric"
            value={sharesInput}
            onChange={(e) =>
              setSharesInput(e.target.value.replace(/[^0-9]/g, ""))
            }
            placeholder="0"
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm w-40 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            autoFocus
          />
          <span className="text-sm text-stone-500">shares</span>
          <button
            type="button"
            onClick={setMax}
            className="text-xs underline text-stone-600 hover:text-stone-800"
          >
            max ({totalShares.toString()})
          </button>
        </div>
        {sharesError && (
          <span className="text-xs text-red-700">{sharesError}</span>
        )}
        {totalShares === BigInt(0) && (
          <span className="text-xs text-stone-500">
            No shares to withdraw. Deposit first.
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
          {submitting ? "Confirming…" : "Withdraw"}
        </button>
      </div>
    </form>
  );
}
