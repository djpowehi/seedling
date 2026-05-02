"use client";

import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useEffect, useState } from "react";
import type { Connection } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import { PROGRAM_ID } from "@/lib/program";
import { setKidName } from "@/lib/kidNames";
import {
  estimatedAnnualYield,
  modeDescription,
  modeLabel,
  setDepositMode,
  totalCommitmentForYear,
  type DepositMode,
} from "@/lib/depositMode";
import type { Seedling } from "@/lib/types";
import { ArrowR } from "./icons";

const MIN_STREAM_USD = 1;
const MAX_STREAM_USD = 1000;

type Props = {
  program: Program<Seedling>;
  connection: Connection;
  parent: PublicKey;
  onCreated: () => void;
  onCancel: () => void;
};

export function AddKidForm({
  program,
  connection,
  parent,
  onCreated,
  onCancel,
}: Props) {
  const [nameInput, setNameInput] = useState("");
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [monthlyInput, setMonthlyInput] = useState("50");
  const [mode, setMode] = useState<DepositMode>("yearly");
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  let parsedKid: PublicKey | null = null;
  let kidValidationError: string | null = null;
  if (pubkeyInput.trim()) {
    try {
      parsedKid = new PublicKey(pubkeyInput.trim());
    } catch {
      kidValidationError = "not a valid Solana address";
    }
  }

  const monthlyNum = parseFloat(monthlyInput);
  let rateValidationError: string | null = null;
  if (!monthlyInput.trim()) {
    rateValidationError = null;
  } else if (Number.isNaN(monthlyNum) || !Number.isFinite(monthlyNum)) {
    rateValidationError = "must be a number";
  } else if (monthlyNum < MIN_STREAM_USD) {
    rateValidationError = `minimum is $${MIN_STREAM_USD}/mo`;
  } else if (monthlyNum > MAX_STREAM_USD) {
    rateValidationError = `maximum is $${MAX_STREAM_USD}/mo`;
  }

  // Pre-flight duplicate check
  useEffect(() => {
    if (!parsedKid) {
      setDuplicateError(null);
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
        setDuplicateError(info ? "already a family for this kid pubkey" : null);
      } catch {
        // submit-time error will surface anything real
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
    duplicateError !== null ||
    !monthlyInput.trim();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled || !parsedKid) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const streamRateBaseUnits = Math.round(monthlyNum * 1_000_000);
      const streamRate = new BN(streamRateBaseUnits);

      const sig = await program.methods
        .createFamily(parsedKid, streamRate)
        .accounts({ parent })
        .rpc({ commitment: "confirmed" });

      const [familyPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("family"), parent.toBuffer(), parsedKid.toBuffer()],
        PROGRAM_ID
      );
      if (nameInput.trim()) {
        setKidName(familyPda.toBase58(), nameInput);
      }
      // Persist deposit cadence right after the create succeeds — drives
      // the family card's reminder badge + the kid view's year recap.
      setDepositMode(familyPda.toBase58(), mode);

      await connection.confirmTransaction(sig, "finalized");
      console.log(`[create_family] tx ${sig}`);
      onCreated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already been processed")) {
        if (parsedKid) {
          const [familyPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("family"), parent.toBuffer(), parsedKid.toBuffer()],
            PROGRAM_ID
          );
          if (nameInput.trim()) setKidName(familyPda.toBase58(), nameInput);
          setDepositMode(familyPda.toBase58(), mode);
        }
        onCreated();
        return;
      }
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
    <section
      className="dash-card"
      style={{
        padding: "36px 40px",
        marginBottom: 32,
        background: "var(--stone-2)",
        border: "1px solid var(--line)",
      }}
    >
      <div
        className="dash-row"
        style={{ justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div className="dash-col" style={{ gap: 10 }}>
          <span className="dash-eyebrow">
            <span className="rule" /> new family
          </span>
          <h2
            className="dash-serif"
            style={{ fontSize: 40, lineHeight: 1, margin: 0 }}
          >
            add a <span className="dash-italic">kid</span>.
          </h2>
        </div>
        <button className="dash-btn-link" onClick={onCancel}>
          close ✕
        </button>
      </div>

      <form
        onSubmit={submit}
        className="dash-col"
        style={{ gap: 18, marginTop: 28 }}
      >
        <div className="dash-addkid-grid">
          <div className="dash-col">
            <label className="dash-field-label">
              name{" "}
              <span
                style={{
                  textTransform: "none",
                  letterSpacing: 0,
                  color: "var(--ink-3)",
                }}
              >
                (optional · for you)
              </span>
            </label>
            <input
              type="text"
              placeholder="Maria"
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
          </div>
          <div className="dash-col">
            <label className="dash-field-label">kid wallet address</label>
            <input
              className="dash-mono-input"
              placeholder="e.g. 7xKX...J9pQ"
              value={pubkeyInput}
              onChange={(e) => setPubkeyInput(e.target.value)}
            />
            {kidValidationError && pubkeyInput.trim() && (
              <span
                className="dash-mono"
                style={{ fontSize: 11, color: "var(--rose)", marginTop: 6 }}
              >
                {kidValidationError}
              </span>
            )}
            {duplicateError && (
              <span
                className="dash-mono"
                style={{ fontSize: 11, color: "var(--rose)", marginTop: 6 }}
              >
                {duplicateError}
              </span>
            )}
          </div>
          <div className="dash-col">
            <label className="dash-field-label">
              monthly · ${MIN_STREAM_USD}–${MAX_STREAM_USD}
            </label>
            <input
              className="dash-mono-input"
              type="number"
              min={MIN_STREAM_USD}
              max={MAX_STREAM_USD}
              value={monthlyInput}
              onChange={(e) => setMonthlyInput(e.target.value)}
            />
            {rateValidationError && (
              <span
                className="dash-mono"
                style={{ fontSize: 11, color: "var(--rose)", marginTop: 6 }}
              >
                {rateValidationError}
              </span>
            )}
          </div>
        </div>

        <ModePicker
          mode={mode}
          onChange={setMode}
          streamRateUsd={
            Number.isFinite(monthlyNum) && monthlyNum > 0 ? monthlyNum : 50
          }
        />

        {submitError && (
          <div
            className="dash-mono"
            style={{ color: "var(--rose)", fontSize: 12 }}
          >
            {submitError}
          </div>
        )}

        <div
          className="dash-row"
          style={{ gap: 10, alignItems: "center", marginTop: 6 }}
        >
          <button
            className="dash-btn dash-btn-primary"
            type="submit"
            disabled={submitDisabled}
          >
            {submitting ? "creating…" : "add kid"}{" "}
            <ArrowR color="currentColor" />
          </button>
          <span
            className="dash-mono"
            style={{ fontSize: 11, color: "var(--ink-3)" }}
          >
            opens phantom to sign · ~0.001 SOL fee
          </span>
        </div>

        <div
          style={{
            marginTop: 14,
            paddingTop: 18,
            borderTop: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span
            className="dash-mono"
            style={{ fontSize: 11, color: "var(--ink-3)" }}
          >
            need usdc?
          </span>
          <div className="dash-row" style={{ gap: 18 }}>
            <a
              className="dash-btn-link"
              href="https://solfaucet.com"
              target="_blank"
              rel="noreferrer"
            >
              SOL faucet ↗
            </a>
            <a
              className="dash-btn-link"
              href="https://faucet.circle.com/?token=USDC&blockchain=SOL"
              target="_blank"
              rel="noreferrer"
            >
              USDC faucet ↗
            </a>
          </div>
        </div>
      </form>
    </section>
  );
}

// ──────────── deposit-cadence picker ────────────
//
// Three pills, each showing the live total commitment + projected yield
// at the current stream rate. Re-computed on every keystroke in the
// monthly input — drives the trade-off message home: "yearly = $X,
// hybrid = $Y, monthly = $Z, here's what you'd actually earn."

function ModePicker({
  mode,
  onChange,
  streamRateUsd,
}: {
  mode: DepositMode;
  onChange: (m: DepositMode) => void;
  streamRateUsd: number;
}) {
  const modes: DepositMode[] = ["yearly", "hybrid", "monthly"];
  return (
    <div
      className="dash-col"
      style={{
        gap: 10,
        marginTop: 4,
      }}
    >
      <span
        className="dash-mono"
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        deposit cadence
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {modes.map((m) => {
          const total = totalCommitmentForYear(m, streamRateUsd);
          const yearly = estimatedAnnualYield(m, streamRateUsd);
          const isActive = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              className="dash-mode-pill"
              style={{
                textAlign: "left",
                padding: "14px 16px",
                borderRadius: 8,
                cursor: "pointer",
                background: isActive ? "var(--forest)" : "var(--stone)",
                color: isActive ? "#F7F2E3" : "var(--ink)",
                border: `1px solid ${
                  isActive ? "var(--forest)" : "var(--line)"
                }`,
                transition: "all 160ms ease",
              }}
            >
              <div
                className="dash-serif"
                style={{ fontSize: 18, lineHeight: 1.05, marginBottom: 4 }}
              >
                {modeLabel(m)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  letterSpacing: "0.04em",
                  color: isActive ? "#E8DDC2" : "var(--ink-3)",
                  marginBottom: 8,
                }}
              >
                {modeDescription(m)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  color: isActive ? "#F7F2E3" : "var(--ink-2)",
                  letterSpacing: "0.02em",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <span>≈ ${total.toLocaleString()} / year you put in</span>
                <span style={{ opacity: 0.85 }}>
                  ≈ ${yearly.toFixed(2)} bonus at year-end
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
