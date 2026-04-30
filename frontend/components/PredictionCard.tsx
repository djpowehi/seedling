"use client";

// Prediction → reveal card on the kid view. Three states:
//   1. NO PREDICTION YET — show 4 chip choices, kid taps one, snapshot
//      saved to localStorage.
//   2. LOCKED — kid has predicted, distribute hasn't fired yet. Show the
//      guess + a quiet "waiting for the 1st" hint.
//   3. RESOLVED — distribute fired. Show prediction vs actual side-by-side,
//      offer a share button that renders the canvas image.
//
// Lifecycle is driven entirely by the chain state passed in via props
// (totalYieldEarned + lastDistribution). No effects fire from inside this
// component — the parent (KidView) decides when to flip from LOCKED to
// RESOLVED based on whether the on-chain timestamp has advanced past the
// prediction.

import { useEffect, useMemo, useRef, useState } from "react";

import {
  baseUnitsToUsd,
  clearPrediction,
  getPrediction,
  savePrediction,
  type Prediction,
} from "@/lib/predictions";
import { renderShareCard, shareOrDownload } from "@/lib/shareCard";

const CHIPS_USD = [0.1, 0.2, 0.5, 1.0] as const;

type Props = {
  familyKey: string;
  kidName: string | null;
  /** Current totalYieldEarned from chain (BN-as-string, base units). */
  totalYieldEarnedBaseUnits: string;
  /** Most recent distribute timestamp from chain (unix sec). */
  lastDistribution: number;
  /** Optional savings goal context for the share card. */
  goal?: { label: string; progressUsd: number; targetUsd: number };
};

function monthLabelFromUnix(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return d.toLocaleString("en-US", { month: "long" });
}

export function PredictionCard({
  familyKey,
  kidName,
  totalYieldEarnedBaseUnits,
  lastDistribution,
  goal,
}: Props) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Hydrate from localStorage on mount, and re-hydrate when the family
  // changes (different kid view).
  useEffect(() => {
    setPrediction(getPrediction(familyKey));
    initializedRef.current = true;
  }, [familyKey]);

  // Resolve the prediction the moment chain state shows a distribute fired
  // AFTER the prediction was made. Snapshot delta: yield NOW minus yield AT
  // PREDICTION TIME → that's what the kid actually earned during the period.
  useEffect(() => {
    if (!prediction || prediction.resolved) return;
    if (lastDistribution <= prediction.predictedAt) return;
    const before = baseUnitsToUsd(prediction.totalYieldAtPrediction);
    const after = baseUnitsToUsd(totalYieldEarnedBaseUnits);
    const actualUsd = Math.max(0, after - before);
    const resolved: Prediction = {
      ...prediction,
      resolved: { actualUsd, resolvedAt: lastDistribution },
    };
    savePrediction(familyKey, resolved);
    setPrediction(resolved);
  }, [prediction, lastDistribution, totalYieldEarnedBaseUnits, familyKey]);

  const handleGuess = (guess: number) => {
    const p: Prediction = {
      guess,
      predictedAt: Math.floor(Date.now() / 1000),
      totalYieldAtPrediction: totalYieldEarnedBaseUnits,
    };
    savePrediction(familyKey, p);
    setPrediction(p);
  };

  const handleShare = async () => {
    if (!prediction?.resolved) return;
    setBusy(true);
    setShareError(null);
    try {
      const blob = await renderShareCard({
        kidName: kidName ?? "kid",
        monthLabel: monthLabelFromUnix(prediction.resolved.resolvedAt),
        guessUsd: prediction.guess,
        actualUsd: prediction.resolved.actualUsd,
        goalLabel: goal?.label,
        goalProgressUsd: goal?.progressUsd,
        goalTargetUsd: goal?.targetUsd,
      });
      await shareOrDownload(
        blob,
        `seedling-${kidName ?? "kid"}-${monthLabelFromUnix(
          prediction.resolved.resolvedAt
        ).toLowerCase()}.png`
      );
    } catch (e) {
      setShareError(
        e instanceof Error ? e.message : "couldn't generate the card"
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePredictNext = () => {
    clearPrediction(familyKey);
    setPrediction(null);
  };

  const guessUsd = prediction?.guess ?? 0;
  const actualUsd = prediction?.resolved?.actualUsd ?? 0;
  const offBy = useMemo(() => {
    if (!prediction?.resolved) return 0;
    return Math.abs(prediction.guess - prediction.resolved.actualUsd);
  }, [prediction]);

  // Don't render the card before we've checked storage — avoids a flash
  // of the predict state on a kid who already guessed.
  if (!initializedRef.current) return null;

  return (
    <section className="kv-card kv-predict">
      <style dangerouslySetInnerHTML={{ __html: PREDICT_STYLES }} />
      {!prediction && (
        <>
          <div className="kv-card-eyebrow">guess this month</div>
          <p className="kv-predict-prompt">
            how much yield will your savings earn this month?
          </p>
          <div className="kv-predict-chips">
            {CHIPS_USD.map((v) => (
              <button
                key={v}
                type="button"
                className="kv-predict-chip"
                onClick={() => handleGuess(v)}
              >
                ${v.toFixed(2)}
              </button>
            ))}
          </div>
          <div className="kv-predict-foot">
            we&apos;ll show the actual when next allowance lands.
          </div>
        </>
      )}

      {prediction && !prediction.resolved && (
        <>
          <div className="kv-card-eyebrow">your guess is locked</div>
          <div className="kv-predict-locked">
            <span className="kv-predict-locked-amt">
              ${guessUsd.toFixed(2)}
            </span>
            <span className="kv-predict-locked-hint">
              we&apos;ll reveal the actual when allowance #{1} lands.
            </span>
          </div>
        </>
      )}

      {prediction?.resolved && (
        <>
          <div className="kv-card-eyebrow">how&apos;d your guess do?</div>
          <div className="kv-predict-versus">
            <div className="kv-predict-side">
              <span className="kv-predict-label">your guess</span>
              <span className="kv-predict-value">${guessUsd.toFixed(2)}</span>
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
            <button
              type="button"
              className="kv-predict-next"
              onClick={handlePredictNext}
            >
              guess next month
            </button>
          </div>
          {shareError && <div className="kv-predict-err">{shareError}</div>}
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
