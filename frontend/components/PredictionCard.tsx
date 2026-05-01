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
  clearPrediction,
  getPrediction,
  savePrediction,
  type Prediction,
} from "@/lib/predictions";
import { renderShareCard, shareOrDownload } from "@/lib/shareCard";

/**
 * Chip values scale with the family's principal AND vary per cycle so the
 * answer can't be memorized.
 *
 * Factors are intentionally not clean (1.0 always means "exactly expected"),
 * which would make chip #2 always the right answer. Instead we use a
 * lightly-jittered spread anchored around the expected yield, then shuffle
 * order. Both jitter and shuffle are seeded by (family + cycle) so the same
 * period always renders the same chips — kid can't refresh to re-roll.
 *
 *   $30   principal → expected ≈ $0.20 → chips ~ $0.10 / $0.20 / $0.40 / $1.00
 *   $300  principal → expected ≈ $2.00 → chips ~ $1 / $2 / $4 / $10
 *   $1800 principal → expected ≈ $12.00 → chips ~ $6 / $12 / $24 / $60
 */

// Deterministic 32-bit hash → seed. Same input → same chip layout every render.
function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Mulberry32 PRNG — small, fast, no deps. Returns deterministic [0, 1).
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scaleChips(principalUsd: number, seedKey: string): number[] {
  const expected = Math.max(0.05, (principalUsd * 0.08) / 12);
  const rng = mulberry32(seedFromString(seedKey));

  // Four factors with jitter so the answer rarely lands exactly on one chip.
  // Base bands: low, near-expected, above-expected, outlier. Each band gets
  // a ±15% wobble so values shift cycle-to-cycle.
  const wobble = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const factors = [
    wobble(0.4, 0.7), // low
    wobble(0.85, 1.2), // near-expected (NOT exactly 1.0)
    wobble(1.7, 2.4), // above
    wobble(3.5, 5.5), // outlier
  ];

  const round = (v: number): number => {
    if (v < 1) return Math.round(v * 100) / 100;
    if (v < 10) return Math.round(v * 10) / 10;
    return Math.round(v);
  };

  const values = factors.map((f) => round(expected * f));
  // Dedup before shuffling so identical rounded values don't appear twice.
  const unique = [...new Set(values)];

  // Fisher-Yates shuffle, also seeded — kid can't tell "answer is always 2nd".
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique;
}

/** Cycle index = number of completed monthly distributes. Each cycle gets a
 * fresh seed so chip layout shifts month over month. */
function cycleIndex(lastDistribution: number, createdAt: number): number {
  const elapsedMonths = Math.max(
    0,
    Math.floor((lastDistribution - createdAt) / (30 * 86_400))
  );
  return elapsedMonths;
}

type Props = {
  familyKey: string;
  kidName: string | null;
  /** Live unrealized yield = familyValue - principalRemaining, in dollars.
   *  This is what's actually accumulating in the vault — the number the
   *  kid is predicting. Monthly allowances draw from principal-first, so
   *  this meter keeps ticking until the 13th allowance pays it out. */
  unrealizedYieldUsd: number;
  /** Most recent distribute timestamp from chain (unix sec). */
  lastDistribution: number;
  /** Family creation timestamp (unix sec) — used to compute cycle index. */
  createdAt: number;
  /** Family principal in dollars — drives the chip scale. */
  principalUsd: number;
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
  unrealizedYieldUsd,
  lastDistribution,
  createdAt,
  principalUsd,
  goal,
}: Props) {
  // Seed = family + cycle. Same period always renders the same chip layout
  // (kid can't refresh to re-roll the answer); next period gets a fresh
  // shuffle + new factor wobble.
  const cycle = cycleIndex(lastDistribution, createdAt);
  const chips = useMemo(
    () => scaleChips(principalUsd, `${familyKey}|${cycle}`),
    [principalUsd, familyKey, cycle]
  );
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  // Two-step lock: kid taps a chip → enters preview state → confirm to lock.
  // Once locked, the prediction is final for the cycle. No edits.
  const [pendingGuess, setPendingGuess] = useState<number | null>(null);
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
  // AFTER the prediction was made. Actual = unrealizedYield NOW minus
  // unrealizedYield AT PREDICTION TIME → the yield Kamino paid the vault
  // during the period (it stays in the vault, doesn't go to the kid until
  // the 13th allowance — but the kid was guessing how much the vault
  // earned, which is what they see ticking).
  useEffect(() => {
    if (!prediction || prediction.resolved) return;
    if (lastDistribution <= prediction.predictedAt) return;
    const before = prediction.unrealizedYieldAtPrediction;
    const after = unrealizedYieldUsd;
    const actualUsd = Math.max(0, after - before);
    const resolved: Prediction = {
      ...prediction,
      resolved: { actualUsd, resolvedAt: lastDistribution },
    };
    savePrediction(familyKey, resolved);
    setPrediction(resolved);
  }, [prediction, lastDistribution, unrealizedYieldUsd, familyKey]);

  // Step 1: kid taps a chip → enter preview. Doesn't persist yet.
  const handlePickChip = (guess: number) => {
    setPendingGuess(guess);
  };

  // Step 2: kid confirms → persist + lock for the cycle.
  const handleConfirmLock = () => {
    if (pendingGuess == null) return;
    const p: Prediction = {
      guess: pendingGuess,
      predictedAt: Math.floor(Date.now() / 1000),
      unrealizedYieldAtPrediction: unrealizedYieldUsd,
    };
    savePrediction(familyKey, p);
    setPrediction(p);
    setPendingGuess(null);
  };

  const handlePickAgain = () => {
    setPendingGuess(null);
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
      {!prediction && pendingGuess == null && (
        <>
          <div className="kv-card-eyebrow">guess before this month closes</div>
          <p className="kv-predict-prompt">
            how much yield will your savings have earned by the time the next
            allowance fires?
          </p>
          <div className="kv-predict-chips">
            {chips.map((v) => (
              <button
                key={v}
                type="button"
                className="kv-predict-chip"
                onClick={() => handlePickChip(v)}
              >
                {v < 1
                  ? `$${v.toFixed(2)}`
                  : v < 10
                  ? `$${v.toFixed(1)}`
                  : `$${v}`}
              </button>
            ))}
          </div>
          <div className="kv-predict-foot">
            actual is revealed at distribute — guess first.
          </div>
        </>
      )}

      {!prediction && pendingGuess != null && (
        <>
          <div className="kv-card-eyebrow">lock in your guess?</div>
          <div className="kv-predict-locked">
            <span className="kv-predict-locked-amt">
              ${pendingGuess.toFixed(2)}
            </span>
            <span className="kv-predict-locked-hint">
              once locked, no changes for the cycle. ready?
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

      {prediction && !prediction.resolved && (
        <>
          <div className="kv-card-eyebrow">your guess is locked</div>
          <div className="kv-predict-locked">
            <span className="kv-predict-locked-amt">
              ${guessUsd.toFixed(2)}
            </span>
            <span className="kv-predict-locked-hint">
              waiting for this month&apos;s distribute. the actual unlocks the
              moment the next allowance fires.
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
