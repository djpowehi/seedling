"use client";

import { PublicKey, SystemProgram } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useRef, useState } from "react";
import type { Connection } from "@solana/web3.js";
import { celebratePlant } from "@/lib/celebrate";
import { setKidName } from "@/lib/kidNames";
import { SeedlingQuasarClient } from "@/lib/quasar-client";
import { useToast } from "@/components/Toast";
import {
  familyPositionPda,
  kidViewPda,
  vaultConfigPda,
} from "@/lib/quasarPdas";
import { sendQuasarIx } from "@/lib/sendQuasarIx";
import {
  defaultHybridConfig,
  estimatedAnnualYield,
  modeDescription,
  modeLabel,
  setDepositMode,
  setHybridConfig,
  totalCommitmentForYear,
  type DepositMode,
  type HybridConfig,
} from "@/lib/depositMode";
import { ArrowR } from "./icons";

const MIN_STREAM_USD = 1;
// Practical ceiling — chain-side u64 holds way more, but $100k/mo per kid
// is the highest realistic family allowance and prevents accidental
// "I typed 100000 by mistake" disasters.
const MAX_STREAM_USD = 100_000;

type Props = {
  connection: Connection;
  parent: PublicKey;
  onCreated: () => void;
  onCancel: () => void;
};

export function AddKidForm({ connection, parent, onCreated, onCancel }: Props) {
  const wallet = useWallet();
  const { showToast } = useToast();
  // Section ref so the planting confetti fires FROM the form's location
  // (not screen-center). Captured before onCreated unmounts us.
  const sectionRef = useRef<HTMLElement>(null);
  const [nameInput, setNameInput] = useState("");
  const [pubkeyInput, setPubkeyInput] = useState("");
  const [monthlyInput, setMonthlyInput] = useState("50");
  const [mode, setMode] = useState<DepositMode>("yearly");
  // Hybrid amounts the parent dialed in. Strings so the input fields can
  // stay editable mid-keystroke; we parse on render. Defaults to the
  // brand sweet-spot (8× upfront + 0.4× monthly) when hybrid is selected.
  const [hybridUpfrontInput, setHybridUpfrontInput] = useState("400");
  const [hybridMonthlyInput, setHybridMonthlyInput] = useState("20");
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Scroll the form into view on mount. The "+ add another kid" button
  // lives at the bottom of the dashboard, but the form renders at the
  // top — without this, clicking the button does nothing visible until
  // the user scrolls up.
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Sync the hybrid pre-fills to whatever stream rate the parent's typed —
  // but only while the parent hasn't manually edited the hybrid fields.
  // Tracked via a "touched" flag so the typed values survive cross-input
  // edits.
  const [hybridTouched, setHybridTouched] = useState(false);
  const monthlyNumForHybridDefault = parseFloat(monthlyInput);
  useEffect(() => {
    if (hybridTouched) return;
    if (
      !Number.isFinite(monthlyNumForHybridDefault) ||
      monthlyNumForHybridDefault <= 0
    )
      return;
    const def = defaultHybridConfig(monthlyNumForHybridDefault);
    setHybridUpfrontInput(String(def.upfrontUsd));
    setHybridMonthlyInput(String(def.monthlyUsd));
  }, [monthlyNumForHybridDefault, hybridTouched]);

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
        // Use the helper so the seed version stays in sync with quasarPdas.ts
        // (which now uses family_v2). Inlining `b"family"` here would drift
        // and let the v1 stale-data PDA register as a duplicate.
        const familyPda = familyPositionPda(parent, parsedKid!);
        const info = await connection.getAccountInfo(familyPda);
        if (cancelled) return;
        // PDA derives from (parent, kid) — collisions only happen for
        // THIS connected wallet + the same kid. A different parent wallet
        // can have its own seedling for this kid simultaneously (e.g.
        // divorced co-parents, grandparent + parent each running one).
        setDuplicateError(
          info ? "you already have a seedling for this kid" : null
        );
      } catch {
        // submit-time error will surface anything real
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [parsedKid?.toBase58(), parent, connection]);

  // For hybrid mode: parent's deposits across the year must at least
  // cover the kid's allowance. Otherwise the kid's monthly distributes
  // would fail mid-year. We block submit on this rather than letting
  // the parent ship a broken setup.
  const hybridShortfallBlocking =
    mode === "hybrid" &&
    Number.isFinite(monthlyNum) &&
    monthlyNum > 0 &&
    parseFloat(hybridUpfrontInput) + parseFloat(hybridMonthlyInput) * 11 <
      monthlyNum * 12;

  const submitDisabled =
    submitting ||
    !parsedKid ||
    kidValidationError !== null ||
    rateValidationError !== null ||
    duplicateError !== null ||
    !monthlyInput.trim() ||
    hybridShortfallBlocking;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled || !parsedKid) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const streamRateBaseUnits = Math.round(monthlyNum * 1_000_000);
      const client = new SeedlingQuasarClient();
      const familyPda = familyPositionPda(parent, parsedKid);
      const kidViewAddr = kidViewPda(parent, parsedKid);

      const ix = client.createCreateFamilyInstruction({
        parent,
        vaultConfig: vaultConfigPda(),
        familyPosition: familyPda,
        kidView: kidViewAddr,
        systemProgram: SystemProgram.programId,
        kid: parsedKid,
        streamRate: BigInt(streamRateBaseUnits),
      });
      const sig = await sendQuasarIx(ix, connection, wallet, {
        commitment: "confirmed",
      });
      if (nameInput.trim()) {
        setKidName(familyPda.toBase58(), nameInput);
      }
      // Persist deposit cadence right after the create succeeds — drives
      // the family card's reminder badge + the kid view's year recap.
      setDepositMode(familyPda.toBase58(), mode);
      if (mode === "hybrid") {
        const upfront = parseFloat(hybridUpfrontInput);
        const monthly = parseFloat(hybridMonthlyInput);
        if (Number.isFinite(upfront) && Number.isFinite(monthly)) {
          setHybridConfig(familyPda.toBase58(), {
            upfrontUsd: upfront,
            monthlyUsd: monthly,
          });
        }
      }

      await connection.confirmTransaction(sig, "finalized");
      console.log(`[create_family] tx ${sig}`);
      // Plant celebration — capture origin BEFORE onCreated unmounts the form.
      const origin = computeOrigin(sectionRef.current);
      void celebratePlant(origin);
      showToast({
        variant: "monthly",
        title: nameInput.trim()
          ? `${nameInput.trim()}'s allowance is planted`
          : "new allowance planted",
        subtitle: `$${monthlyNum}/mo · earning yield on Kamino`,
      });
      onCreated();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.toLowerCase().includes("already been processed")) {
        if (parsedKid) {
          const familyPda = familyPositionPda(parent, parsedKid);
          if (nameInput.trim()) setKidName(familyPda.toBase58(), nameInput);
          setDepositMode(familyPda.toBase58(), mode);
          if (mode === "hybrid") {
            const upfront = parseFloat(hybridUpfrontInput);
            const monthly = parseFloat(hybridMonthlyInput);
            if (Number.isFinite(upfront) && Number.isFinite(monthly)) {
              setHybridConfig(familyPda.toBase58(), {
                upfrontUsd: upfront,
                monthlyUsd: monthly,
              });
            }
          }
        }
        const origin = computeOrigin(sectionRef.current);
        void celebratePlant(origin);
        showToast({
          variant: "monthly",
          title: nameInput.trim()
            ? `${nameInput.trim()}'s allowance is planted`
            : "new allowance planted",
          subtitle: `$${monthlyNum}/mo · earning yield on Kamino`,
        });
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
      ref={sectionRef}
      className="dash-card"
      style={{
        padding: "36px 40px",
        marginBottom: 32,
        background: "var(--stone-2)",
        border: "1px solid var(--line)",
        // Leaves breathing room above the eyebrow when scrollIntoView
        // lands the form — without this the seedling header overlaps
        // the "new family" eyebrow line.
        scrollMarginTop: 120,
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
              monthly · min ${MIN_STREAM_USD}
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
            {!rateValidationError &&
              Number.isFinite(monthlyNum) &&
              monthlyNum > 0 && (
                <span
                  className="dash-mono"
                  style={{
                    fontSize: 11,
                    color: "var(--ink-3)",
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  recommended deposit · ${(monthlyNum * 24).toLocaleString()}{" "}
                  upfront → ${(monthlyNum * 12).toLocaleString()} covers the
                  year, ${(monthlyNum * 12).toLocaleString()} earns the bonus
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
          hybridUpfrontInput={hybridUpfrontInput}
          hybridMonthlyInput={hybridMonthlyInput}
          onHybridUpfrontChange={(v) => {
            setHybridUpfrontInput(v);
            setHybridTouched(true);
          }}
          onHybridMonthlyChange={(v) => {
            setHybridMonthlyInput(v);
            setHybridTouched(true);
          }}
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

/** Convert an element's bounding rect to canvas-confetti's normalized
 *  [0..1] viewport coordinates. Returns the element's center-bottom so
 *  the planting sprout rises FROM the new family card area, not screen-
 *  center. Falls back to lower-center on null. */
function computeOrigin(el: HTMLElement | null): { x: number; y: number } {
  if (!el || typeof window === "undefined") {
    return { x: 0.5, y: 0.7 };
  }
  const r = el.getBoundingClientRect();
  return {
    x: (r.left + r.width / 2) / window.innerWidth,
    y: (r.top + r.height * 0.85) / window.innerHeight,
  };
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
  hybridUpfrontInput,
  hybridMonthlyInput,
  onHybridUpfrontChange,
  onHybridMonthlyChange,
}: {
  mode: DepositMode;
  onChange: (m: DepositMode) => void;
  streamRateUsd: number;
  hybridUpfrontInput: string;
  hybridMonthlyInput: string;
  onHybridUpfrontChange: (v: string) => void;
  onHybridMonthlyChange: (v: string) => void;
}) {
  const modes: DepositMode[] = ["yearly", "hybrid", "monthly"];

  // Live hybrid config from the parent's typed values. Falls back to
  // brand default if either field is empty/invalid so the yield estimate
  // is always meaningful.
  const upfrontParsed = parseFloat(hybridUpfrontInput);
  const monthlyParsed = parseFloat(hybridMonthlyInput);
  const liveHybrid: HybridConfig = {
    upfrontUsd:
      Number.isFinite(upfrontParsed) && upfrontParsed >= 0 ? upfrontParsed : 0,
    monthlyUsd:
      Number.isFinite(monthlyParsed) && monthlyParsed >= 0 ? monthlyParsed : 0,
  };

  // Total kid will need over the year — used to validate that the
  // parent's chosen hybrid commitment actually covers the allowance.
  const minCommitment = streamRateUsd * 12;
  const hybridTotal = liveHybrid.upfrontUsd + liveHybrid.monthlyUsd * 11;
  const hybridYield = estimatedAnnualYield(
    "hybrid",
    streamRateUsd,
    8,
    liveHybrid
  );
  const yearlyYield = estimatedAnnualYield("yearly", streamRateUsd);
  const hybridRecovery =
    yearlyYield > 0 ? Math.round((hybridYield / yearlyYield) * 100) : 0;
  const hybridShortfall = Math.max(0, minCommitment - hybridTotal);

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
      {/* Principle line — frames the cadence asymmetry as intentional
          design (seedling rewards time), not a limitation of monthly. */}
      <p
        className="dash-serif"
        style={{
          margin: 0,
          fontSize: 17,
          lineHeight: 1.35,
          color: "var(--ink-2)",
          letterSpacing: "-0.005em",
        }}
      >
        Seedling rewards time —{" "}
        <span className="dash-italic">
          the longer money stays, the more the kid earns.
        </span>
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {modes.map((m) => {
          const total =
            m === "hybrid"
              ? hybridTotal
              : totalCommitmentForYear(m, streamRateUsd);
          const yearly =
            m === "hybrid"
              ? hybridYield
              : estimatedAnnualYield(m, streamRateUsd);
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <span
                  className="dash-serif"
                  style={{ fontSize: 18, lineHeight: 1.05 }}
                >
                  {modeLabel(m)}
                </span>
                {m === "yearly" && (
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains-mono), monospace",
                      fontSize: 9,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      padding: "2px 7px",
                      borderRadius: 99,
                      background: isActive
                        ? "rgba(247, 242, 227, 0.18)"
                        : "var(--forest)",
                      color: isActive ? "#F7F2E3" : "#F7F2E3",
                      border: isActive
                        ? "1px solid rgba(247, 242, 227, 0.4)"
                        : "1px solid var(--forest)",
                    }}
                  >
                    recommended
                  </span>
                )}
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
                {m === "yearly" ? (
                  <>
                    <span>≈ ${Math.round(total).toLocaleString()} upfront</span>
                    <span style={{ opacity: 0.85 }}>
                      ≈ ${(streamRateUsd * 12).toLocaleString()} back to you + ≈
                      ${yearly.toFixed(2)} kid bonus
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      ≈ ${Math.round(total).toLocaleString()} / year you put in
                    </span>
                    <span style={{ opacity: 0.85 }}>
                      ≈ ${yearly.toFixed(2)} kid bonus at year-end
                    </span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Expandable hybrid customization — appears only when hybrid is
          the active mode. Two inputs (upfront / monthly) + live yield calc. */}
      {mode === "hybrid" && (
        <div
          style={{
            marginTop: 4,
            padding: "16px 18px",
            borderRadius: 10,
            background: "var(--stone)",
            border: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <div className="dash-col">
              <label
                className="dash-field-label"
                style={{ fontSize: 10, marginBottom: 6 }}
              >
                upfront deposit
              </label>
              <input
                className="dash-mono-input"
                type="number"
                min={0}
                step={1}
                value={hybridUpfrontInput}
                onChange={(e) => onHybridUpfrontChange(e.target.value)}
              />
            </div>
            <div className="dash-col">
              <label
                className="dash-field-label"
                style={{ fontSize: 10, marginBottom: 6 }}
              >
                monthly top-up · for 11 months
              </label>
              <input
                className="dash-mono-input"
                type="number"
                min={0}
                step={1}
                value={hybridMonthlyInput}
                onChange={(e) => onHybridMonthlyChange(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: 11,
              color: "var(--ink-2)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              paddingTop: 6,
              borderTop: "1px dashed var(--line)",
            }}
          >
            <span>
              total over the year: ≈ ${Math.round(hybridTotal).toLocaleString()}{" "}
              · kid receives ${(streamRateUsd * 12).toLocaleString()}
            </span>
            <span>
              estimated bonus: ≈ ${hybridYield.toFixed(2)} ({hybridRecovery}% of
              yearly&apos;s ${yearlyYield.toFixed(2)})
            </span>
          </div>

          {/* Suggest switching out of hybrid when one of the two amounts
              is zero — that's not a hybrid, that's yearly (monthly=0)
              or monthly (upfront=0). Cleaner for the parent. */}
          {liveHybrid.upfrontUsd === 0 && liveHybrid.monthlyUsd > 0 && (
            <button
              type="button"
              onClick={() => onChange("monthly")}
              className="dash-mono"
              style={{
                fontSize: 11,
                color: "var(--forest-deep)",
                background: "rgba(46, 92, 64, 0.08)",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid rgba(46, 92, 64, 0.25)",
                cursor: "pointer",
                textAlign: "left",
                lineHeight: 1.5,
              }}
            >
              upfront is $0 → that&apos;s monthly, not hybrid. tap to switch to
              the monthly cadence (cleaner setup).
            </button>
          )}
          {liveHybrid.upfrontUsd > 0 && liveHybrid.monthlyUsd === 0 && (
            <button
              type="button"
              onClick={() => onChange("yearly")}
              className="dash-mono"
              style={{
                fontSize: 11,
                color: "var(--forest-deep)",
                background: "rgba(46, 92, 64, 0.08)",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid rgba(46, 92, 64, 0.25)",
                cursor: "pointer",
                textAlign: "left",
                lineHeight: 1.5,
              }}
            >
              monthly top-up is $0 → that&apos;s yearly, not hybrid. tap to
              switch to the yearly cadence (one deposit, max yield).
            </button>
          )}

          {hybridShortfall > 0 &&
            liveHybrid.upfrontUsd > 0 &&
            liveHybrid.monthlyUsd > 0 && (
              <div
                className="dash-mono"
                style={{
                  fontSize: 11,
                  color: "var(--rose)",
                  background: "rgba(176, 71, 58, 0.08)",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(176, 71, 58, 0.25)",
                }}
              >
                your deposits cover ${Math.round(hybridTotal).toLocaleString()},
                but the kid needs ${minCommitment.toLocaleString()} over the
                year. the allowance will pause $
                {Math.round(hybridShortfall).toLocaleString()} short unless you
                add more.
              </div>
            )}
        </div>
      )}

      {/* Honest enforcement disclosure — protocol does NOT lock the parent
          into monthly deposits. Funds already deposited stay safe; if a
          top-up is missed, the kid's allowance simply pauses until the
          parent tops up. Same disclosure on every mode for consistency. */}
      <div
        className="dash-mono"
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          padding: "10px 12px",
          background: "rgba(46, 92, 64, 0.04)",
          border: "1px dashed var(--line)",
          borderRadius: 6,
          letterSpacing: 0,
          textTransform: "none",
          lineHeight: 1.5,
        }}
      >
        we don&apos;t auto-debit your wallet. you commit to depositing on your
        chosen cadence; missed top-ups pause the kid&apos;s allowance until you
        catch up. funds you&apos;ve deposited are always safe in the vault.
      </div>
    </div>
  );
}
