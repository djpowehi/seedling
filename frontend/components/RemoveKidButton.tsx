"use client";

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
import { DEVNET_ADDRESSES, PROGRAM_ID } from "@/lib/program";
import type { FamilyView } from "@/lib/fetchFamilies";
import type { Seedling } from "@/lib/types";
import { removeKidName } from "@/lib/kidNames";
import { removeSavingsGoal } from "@/lib/savingsGoals";

const SYSVAR_INSTRUCTIONS = new PublicKey(
  "Sysvar1nstructions1111111111111111111111111"
);

type Props = {
  program: Program<Seedling>;
  connection: Connection;
  parent: PublicKey;
  family: FamilyView;
  onRemoved: () => void;
};

export function RemoveKidButton({
  program,
  connection,
  parent,
  family,
  onRemoved,
}: Props) {
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasShares = !family.shares.isZero();

  const handleClick = async () => {
    if (!confirming) {
      setConfirming(true);
      setError(null);
      // Auto-cancel confirmation if user wanders off for 5 seconds.
      setTimeout(() => setConfirming((v) => v), 5000);
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const parentUsdcAta = getAssociatedTokenAddressSync(
        DEVNET_ADDRESSES.usdcMint,
        parent
      );
      const [kidViewPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("kid"), parent.toBuffer(), family.kid.toBuffer()],
        PROGRAM_ID
      );
      const [lendingMarketAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from("lma"), DEVNET_ADDRESSES.kaminoMarket.toBuffer()],
        DEVNET_ADDRESSES.klendProgram
      );
      // Idempotent ATA so the close redeem flow has a destination even
      // if the parent's USDC ATA never existed.
      const ataIx = createAssociatedTokenAccountIdempotentInstruction(
        parent,
        parentUsdcAta,
        parent,
        DEVNET_ADDRESSES.usdcMint
      );

      const sig = await program.methods
        .closeFamily()
        .accountsPartial({
          familyPosition: family.pubkey,
          kidView: kidViewPda,
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
          ComputeBudgetProgram.setComputeUnitLimit({ units: 350_000 }),
          ataIx,
        ])
        .rpc({ commitment: "confirmed" });

      console.log(`[close_family] tx ${sig}`);
      await connection.confirmTransaction(sig, "finalized");

      // Local state cleanup — orphaned localStorage entries left behind
      // are harmless but ugly.
      const familyKey = family.pubkey.toBase58();
      removeKidName(familyKey);
      removeSavingsGoal(familyKey);

      onRemoved();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already been processed")) {
        const familyKey = family.pubkey.toBase58();
        removeKidName(familyKey);
        removeSavingsGoal(familyKey);
        onRemoved();
        return;
      }
      if (msg.includes("VaultPaused"))
        setError("Vault is paused — can't redeem right now.");
      else if (msg.includes("BelowDustThreshold"))
        setError("Family balance is below the redeemable dust threshold.");
      else setError(msg);
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = () => {
    setConfirming(false);
    setError(null);
  };

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={handleClick}
        className="text-xs text-red-700/70 hover:text-red-800 self-start underline"
        title="Close this family. Redeems any remaining shares to your wallet."
      >
        remove kid
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex flex-col gap-2 text-sm">
      <div className="text-red-900">
        {hasShares ? (
          <>
            Remove this kid? Your wallet receives back any remaining USDC (~
            {(Number(family.principalRemaining.toString()) / 1_000_000).toFixed(
              2
            )}
            ). This signs a transaction.
          </>
        ) : (
          <>
            Remove this kid? No USDC to redeem; just closes the on-chain
            accounts.
          </>
        )}
      </div>
      {error && <div className="text-xs text-red-800">{error}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={submitting}
          className="text-xs text-stone-600 hover:text-stone-800"
        >
          cancel
        </button>
        <button
          type="button"
          onClick={handleClick}
          disabled={submitting}
          className="rounded-full bg-red-700 text-white px-3 py-1 text-xs font-medium hover:bg-red-800 disabled:opacity-50"
        >
          {submitting
            ? "Removing…"
            : hasShares
            ? "Yes, redeem & remove"
            : "Yes, remove"}
        </button>
      </div>
    </div>
  );
}
