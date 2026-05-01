"use client";

// "Guess last month's yield" card on the kid view. Synchronous loop:
//
//   1. PREDICT — kid sees chips and a prompt for [last month]'s yield
//   2. PREVIEW — kid tapped a chip, confirmation prompt
//   3. REVEAL  — kid confirmed, sees their guess vs the actual + share
//
// "Last month" = the calendar month before today. May → April. June → May.
// The "actual" is computed deterministically from principal × 8% APY ×
// days-in-last-month with seeded jitter — no chain reads, no async waiting,
// no snapshot persistence. Same family + same cycle → same actual every
// render. Refreshing the page after a guess keeps the kid in REVEAL state
// because the guess is persisted in localStorage (just the guess; the
// actual is recomputed).
//
// When the calendar month rolls over, the cycleKey changes → a fresh
// PREDICT prompt appears for the newly-completed month. The previous
// month's guess record is no longer surfaced (different cycleKey).

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildChipsAndActual,
  currentCycleKey,
  cycleLabel,
  getPrediction,
  migrateLegacyRecord,
  previousCycleKey,
  savePrediction,
  type Prediction,
} from "@/lib/predictions";
import { renderShareCard, shareOrDownload } from "@/lib/shareCard";

function fmtChip(v: number): string {
  if (v < 1) return `$${v.toFixed(2)}`;
  if (v < 10) return `$${v.toFixed(1)}`;
  return `$${v}`;
}

// ──────────── component ────────────

type Props = {
  familyKey: string;
  kidName: string | null;
  /** Family principal in dollars — drives chip scale + actual computation. */
  principalUsd: number;
  /** Optional savings goal context for the share card. */
  goal?: { label: string; progressUsd: number; targetUsd: number };
};

export function PredictionCard({
  familyKey,
  kidName,
  principalUsd,
  goal,
}: Props) {
  // currentCycle is "today's month" → the prompt asks about the PREVIOUS
  // month. Re-evaluate periodically so a kid who leaves the page open
  // through midnight on the 1st sees the new cycle take over cleanly.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const currentCycle = useMemo(() => currentCycleKey(), [tick]);
  const targetCycle = useMemo(
    () => previousCycleKey(currentCycle),
    [currentCycle]
  );
  const targetMonthLabel = cycleLabel(targetCycle).split(" ")[0]; // "April"

  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [pendingGuess, setPendingGuess] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Hydrate on mount + cycle change. Run the legacy-record sweep once.
  useEffect(() => {
    migrateLegacyRecord(familyKey);
    setPrediction(getPrediction(familyKey, currentCycle));
    setPendingGuess(null);
    initializedRef.current = true;
  }, [familyKey, currentCycle]);

  // Single-source-of-truth: chips and actual are computed together so the
  // actual is GUARANTEED to be one of the chips (after rounding). Decoys
  // sit on both sides of the actual at unpredictable magnitudes — the kid
  // can't game by always picking the second-smallest or middle chip.
  const { chips, actual: actualUsd } = useMemo(
    () => buildChipsAndActual(principalUsd, targetCycle, familyKey),
    [principalUsd, targetCycle, familyKey]
  );

  // ──────────── handlers ────────────

  const handlePickChip = (guess: number) => setPendingGuess(guess);

  const handleConfirmLock = () => {
    if (pendingGuess == null) return;
    const p: Prediction = {
      guess: pendingGuess,
      predictedAt: Math.floor(Date.now() / 1000),
      cycleKey: currentCycle,
    };
    savePrediction(familyKey, currentCycle, p);
    setPrediction(p);
    setPendingGuess(null);
  };

  const handlePickAgain = () => setPendingGuess(null);

  const handleShare = async () => {
    if (!prediction) return;
    setBusy(true);
    setShareError(null);
    try {
      const blob = await renderShareCard({
        kidName: kidName ?? "kid",
        monthLabel: targetMonthLabel,
        guessUsd: prediction.guess,
        actualUsd,
        goalLabel: goal?.label,
        goalProgressUsd: goal?.progressUsd,
        goalTargetUsd: goal?.targetUsd,
      });
      await shareOrDownload(
        blob,
        `seedling-${kidName ?? "kid"}-${targetCycle}.png`
      );
    } catch (e) {
      setShareError(
        e instanceof Error ? e.message : "couldn't generate the card"
      );
    } finally {
      setBusy(false);
    }
  };

  // ──────────── render ────────────

  if (!initializedRef.current) return null;

  // State priority:
  //   prediction exists → REVEAL
  //   pendingGuess set  → PREVIEW
  //   otherwise         → PREDICT
  const showReveal = !!prediction;
  const showPreview = !prediction && pendingGuess != null;
  const showPredict = !prediction && pendingGuess == null;

  const offBy = prediction ? Math.abs(prediction.guess - actualUsd) : 0;

  return (
    <section className="kv-card kv-predict">
      <style dangerouslySetInnerHTML={{ __html: PREDICT_STYLES }} />

      {showPredict && (
        <>
          <div className="kv-card-eyebrow">
            guess {targetMonthLabel}&apos;s yield
          </div>
          <p className="kv-predict-prompt">
            how much did your savings earn during {targetMonthLabel}?
          </p>
          <div className="kv-predict-chips">
            {chips.map((v) => (
              <button
                key={v}
                type="button"
                className="kv-predict-chip"
                onClick={() => handlePickChip(v)}
              >
                {fmtChip(v)}
              </button>
            ))}
          </div>
          <div className="kv-predict-foot">
            tap a chip — the answer reveals right after.
          </div>
        </>
      )}

      {showPreview && pendingGuess != null && (
        <>
          <div className="kv-card-eyebrow">lock in your guess?</div>
          <div className="kv-predict-locked">
            <span className="kv-predict-locked-amt">
              ${pendingGuess.toFixed(2)}
            </span>
            <span className="kv-predict-locked-hint">
              once you lock, the answer reveals. ready?
            </span>
          </div>
          <div className="kv-predict-actions">
            <button
              type="button"
              className="kv-predict-share"
              onClick={handleConfirmLock}
            >
              lock it in
            </button>
            <button
              type="button"
              className="kv-predict-next"
              onClick={handlePickAgain}
            >
              pick again
            </button>
          </div>
        </>
      )}

      {showReveal && prediction && (
        <>
          <div className="kv-card-eyebrow">
            how&apos;d your {targetMonthLabel} guess do?
          </div>
          <div className="kv-predict-versus">
            <div className="kv-predict-side">
              <span className="kv-predict-label">your guess</span>
              <span className="kv-predict-value">
                ${prediction.guess.toFixed(2)}
              </span>
            </div>
            <span className="kv-predict-vs">vs</span>
            <div className="kv-predict-side">
              <span className="kv-predict-label">actual</span>
              <span className="kv-predict-value kv-predict-actual">
                ${actualUsd.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="kv-predict-diff">
            {offBy < 0.01
              ? "spot on. nice."
              : `off by ${Math.round(offBy * 100)}¢.`}
          </div>
          <div className="kv-predict-actions">
            <button
              type="button"
              className="kv-predict-share"
              onClick={handleShare}
              disabled={busy}
            >
              {busy ? "making card…" : "share my month"}
            </button>
          </div>
          {shareError && <div className="kv-predict-err">{shareError}</div>}
          <div className="kv-predict-foot">
            next prompt opens on the 1st of next month.
          </div>
        </>
      )}
    </section>
  );
}

const PREDICT_STYLES = `
  .kv-predict { gap: 14px; }

  .kv-predict-prompt {
    font-family: var(--serif);
    font-size: 22px; line-height: 1.25;
    color: var(--green-900);
    margin: 0;
    letter-spacing: -0.005em;
  }

  .kv-predict-chips {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }
  .kv-predict-chip {
    font-family: var(--mono);
    padding: 14px 0;
    font-size: 14px;
    background: var(--stone-50);
    color: var(--green-900);
    border: 1px solid var(--stone-300);
    border-radius: 99px;
    cursor: pointer;
    letter-spacing: 0.02em;
    transition: all 140ms ease;
  }
  .kv-predict-chip:hover {
    border-color: var(--green-700);
    background: var(--stone-100);
  }
  .kv-predict-foot {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-muted);
    letter-spacing: 0.04em;
  }

  .kv-predict-locked {
    display: flex; flex-direction: column; gap: 4px;
  }
  .kv-predict-locked-amt {
    font-family: var(--serif);
    font-size: 36px; line-height: 1;
    color: var(--green-900);
    font-variant-numeric: tabular-nums;
  }
  .kv-predict-locked-hint {
    font-family: var(--mono); font-size: 11px;
    color: var(--ink-muted); letter-spacing: 0.04em;
  }

  .kv-predict-versus {
    display: flex; align-items: flex-end;
    gap: 12px;
  }
  .kv-predict-side {
    display: flex; flex-direction: column; gap: 4px;
  }
  .kv-predict-label {
    font-family: var(--mono);
    font-size: 10.5px; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--ink-muted);
  }
  .kv-predict-value {
    font-family: var(--serif);
    font-size: 36px; line-height: 1;
    color: var(--green-900);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }
  .kv-predict-actual {
    font-style: italic;
    color: var(--green-700);
  }
  .kv-predict-vs {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-muted);
    padding-bottom: 6px;
    letter-spacing: 0.06em;
  }
  .kv-predict-diff {
    font-family: var(--serif);
    font-size: 17px;
    color: var(--green-700);
    letter-spacing: -0.005em;
  }
  .kv-predict-actions {
    display: flex; gap: 8px; flex-wrap: wrap;
    margin-top: 4px;
  }
  .kv-predict-share {
    flex: 1; min-width: 140px;
    padding: 12px 18px;
    background: var(--green-700);
    color: var(--stone-50);
    border: none; border-radius: 12px;
    font-family: var(--sans);
    font-size: 14px; font-weight: 500;
    cursor: pointer;
    letter-spacing: 0.02em;
    transition: background 140ms ease;
  }
  .kv-predict-share:hover { background: var(--green-800); }
  .kv-predict-share:disabled { opacity: 0.6; cursor: wait; }
  .kv-predict-next {
    padding: 12px 16px;
    background: var(--stone-50);
    color: var(--ink);
    border: 1px solid var(--stone-300);
    border-radius: 12px;
    font-family: var(--mono);
    font-size: 12px; cursor: pointer;
    letter-spacing: 0.02em;
  }
  .kv-predict-next:hover { border-color: var(--green-700); color: var(--green-700); }
  .kv-predict-err {
    font-family: var(--mono); font-size: 11px;
    color: #C84A3D;
  }
`;
