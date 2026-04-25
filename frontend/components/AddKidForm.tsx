"use client";

import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";
import type { Connection } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID } from "@/lib/program";
import type { Seedling } from "@/lib/types";

/**
 * Bounds match the Rust handler:
 *   programs/seedling/src/instructions/create_family.rs:9
 *   pub const MAX_STREAM_RATE: u64 = 1_000 * 1_000_000;  // $1000/mo
 *
 * Stream rate must be > 0 and <= MAX. We validate client-side so the user
 * gets feedback before paying gas, but the program will reject regardless
 * if these bounds are violated.
 */
const MIN_STREAM_USD = 1;
const MAX_STREAM_USD = 1000;

type Props = {
  program: Program<Seedling>;
  connection: Connection;
  parent: PublicKey;
  onCreated: () => void;
  onCancel: () => void;
};

type ValidationState = {
  kidError: string | null;
  rateError: string | null;
  duplicateError: string | null;
};

export function AddKidForm({
  program,
  connection,
  parent,
  onCreated,
  onCancel,
}: Props) {
  const [kidInput, setKidInput] = useState("");
  const [rateInput, setRateInput] = useState("50");
  const [validation, setValidation] = useState<ValidationState>({
    kidError: null,
    rateError: null,
    duplicateError: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Synchronous kid pubkey validation (catches PublicKey constructor throw).
  let parsedKid: PublicKey | null = null;
  let kidValidationError: string | null = null;
  if (kidInput.trim()) {
    try {
      parsedKid = new PublicKey(kidInput.trim());
    } catch {
      kidValidationError = "not a valid Solana address";
    }
  }

  // Synchronous stream-rate validation.
  let rateValidationError: string | null = null;
  const rateNum = parseFloat(rateInput);
  if (!rateInput.trim()) {
    rateValidationError = null;
  } else if (Number.isNaN(rateNum) || !Number.isFinite(rateNum)) {
    rateValidationError = "must be a number";
  } else if (rateNum < MIN_STREAM_USD) {
    rateValidationError = `minimum is $${MIN_STREAM_USD}/mo`;
  } else if (rateNum > MAX_STREAM_USD) {
    rateValidationError = `maximum is $${MAX_STREAM_USD}/mo`;
  }

  // Async pre-flight: if a family for (parent, kid) already exists, surface
  // a friendly inline error before the user pays gas. Anchor's init
  // constraint would reject with a generic 0x0 ("already in use"), which
  // is a worse UX than a pre-check.
  useEffect(() => {
    if (!parsedKid) {
      setValidation((v) => ({ ...v, duplicateError: null }));
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const [familyPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("family"), parent.toBuffer(), parsedKid!.toBuffer()],
          PROGRAM_ID
        );
        const info = await connection.getAccountInfo(familyPda);
        if (cancelled) return;
        setValidation((v) => ({
          ...v,
          duplicateError: info
            ? "you've already set up an allowance for this kid"
            : null,
        }));
      } catch {
        // Silently ignore; submit-time error will surface anything real.
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [parsedKid?.toBase58(), parent, connection]);

  const submitDisabled =
    submitting ||
    !parsedKid ||
    kidValidationError !== null ||
    rateValidationError !== null ||
    validation.duplicateError !== null ||
    !rateInput.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled || !parsedKid) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // 6-decimal USDC: $50 → 50_000_000 base units.
      // Math.round for inputs like "1.5" → 1_500_000 (NOT 1.5e6 float drift).
      const streamRateBaseUnits = Math.round(rateNum * 1_000_000);
      const streamRate = new BN(streamRateBaseUnits);

      // vault_config auto-resolves from the const seed [b"vault_config"];
      // family_position + kid_view auto-resolve from parent + kid args.
      // Only `parent` needs to be passed explicitly (it's the signer).
      const sig = await program.methods
        .createFamily(parsedKid, streamRate)
        .accounts({ parent })
        .rpc({ commitment: "confirmed" });

      // Give devnet RPC a moment for the new accounts to propagate to the
      // node serving getProgramAccounts. Without this, the immediate refetch
      // can briefly hit a stale snapshot and surface a transient error.
      // 1.5s is overkill for the happy path but prevents flicker.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      console.log(`[create_family] tx ${sig}`);

      onCreated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Map common Anchor error shapes to friendlier copy.
      if (msg.includes("already in use")) {
        setSubmitError("This kid already has an allowance set up.");
      } else if (msg.includes("InvalidStreamRate")) {
        setSubmitError(
          `Stream rate must be between $${MIN_STREAM_USD} and $${MAX_STREAM_USD}/mo.`
        );
      } else if (msg.includes("VaultPaused")) {
        setSubmitError("The vault is paused. Try again later.");
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
      className="rounded-2xl bg-white border border-stone-200 p-6 flex flex-col gap-5 shadow-sm"
    >
      <header className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-emerald-900">Add a kid</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-stone-500 hover:text-stone-700"
        >
          cancel
        </button>
      </header>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="kid-pubkey"
          className="text-xs uppercase tracking-wider text-stone-500"
        >
          Kid&apos;s wallet address
        </label>
        <input
          id="kid-pubkey"
          type="text"
          value={kidInput}
          onChange={(e) => setKidInput(e.target.value)}
          placeholder="A Solana wallet (e.g. from Phantom)"
          autoComplete="off"
          spellCheck={false}
          className="rounded-lg border border-stone-300 px-3 py-2 font-mono text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        />
        {kidValidationError && kidInput.trim() && (
          <span className="text-xs text-red-700">{kidValidationError}</span>
        )}
        {validation.duplicateError && (
          <span className="text-xs text-red-700">
            {validation.duplicateError}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="stream-rate"
          className="text-xs uppercase tracking-wider text-stone-500"
        >
          Monthly allowance (USD)
        </label>
        <div className="flex items-center gap-2">
          <span className="text-stone-500">$</span>
          <input
            id="stream-rate"
            type="number"
            min={MIN_STREAM_USD}
            max={MAX_STREAM_USD}
            step="0.01"
            value={rateInput}
            onChange={(e) => setRateInput(e.target.value)}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm w-32 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          <span className="text-sm text-stone-500">/mo</span>
        </div>
        <span className="text-xs text-stone-500">
          ${MIN_STREAM_USD} – ${MAX_STREAM_USD} per month
        </span>
        {rateValidationError && (
          <span className="text-xs text-red-700">{rateValidationError}</span>
        )}
      </div>

      {submitError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {submitError}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm text-stone-600 hover:text-stone-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-full bg-lime-600 px-5 py-2 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? "Confirming…" : "Add kid"}
        </button>
      </div>
    </form>
  );
}
