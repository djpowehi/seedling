"use client";

// Calendar-month yield prediction card on the kid view.
//
// Cycle = calendar month. The kid taps a guess at any point during the
// month; the prediction sticks until the month rolls over. The first time
// the page loads in the next month, the previous month's prediction
// resolves automatically — actual = (current unrealized yield) − (snapshot
// at prediction time). Distribute events are completely decoupled — yield
// accrues regardless of when the parent fires distribute.
//
// State machine:
//
//   1. PREDICT (current month, no record)         — show chips
//   2. PREVIEW (current month, chip tapped)        — show "lock it in?" prompt
//   3. LOCKED  (current month, prediction saved)   — show locked guess
//   4. RESOLVE (prior month, unresolved record)    — flip to resolved on mount
//   5. REVEAL  (prior month, resolved record)      — show vs actual + share
//
// At any time only ONE state renders, driven by:
//   - currentCycle (always today's YYYY-MM)
//   - thisMonthPrediction (record for currentCycle)
//   - priorPrediction (record for the most recent earlier cycle)

import { useEffect, useMemo, useRef, useState } from "react";

import {
  cycleLabel,
  currentCycleKey,
  findPriorPrediction,
  getPrediction,
  migrateLegacyRecord,
  savePrediction,
  type Prediction,
} from "@/lib/predictions";
import { renderShareCard, shareOrDownload } from "@/lib/shareCard";

// ──────────── chip generation (unchanged from prior version) ────────────

function seedFromString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

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
  const wobble = (lo: number, hi: number) => lo + rng() * (hi - lo);
  const factors = [
    wobble(0.4, 0.7),
    wobble(0.85, 1.2),
    wobble(1.7, 2.4),
    wobble(3.5, 5.5),
  ];
  const round = (v: number): number => {
    if (v < 1) return Math.round(v * 100) / 100;
    if (v < 10) return Math.round(v * 10) / 10;
    return Math.round(v);
  };
  const values = factors.map((f) => round(expected * f));
  const unique = [...new Set(values)];
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique;
}

// ──────────── component ────────────

type Props = {
  familyKey: string;
  kidName: string | null;
  /** Live unrealized yield = familyValue - principalRemaining, in dollars. */
  unrealizedYieldUsd: number;
  /** Family principal in dollars — drives chip scale. */
  principalUsd: number;
  /** Optional savings goal context for the share card. */
  goal?: { label: string; progressUsd: number; targetUsd: number };
};

function fmtChip(v: number): string {
  if (v < 1) return `$${v.toFixed(2)}`;
  if (v < 10) return `$${v.toFixed(1)}`;
  return `$${v}`;
}

export function PredictionCard({
  familyKey,
  kidName,
  unrealizedYieldUsd,
  principalUsd,
  goal,
}: Props) {
  // Re-evaluate the cycle key on a slow tick so a kid who leaves the page
  // open across midnight on the 1st sees the prediction transition cleanly.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(id);
  }, []);
  const currentCycle = useMemo(() => currentCycleKey(), []);

  // Hydrate state on mount and whenever the family / cycle changes. We also
  // run the legacy-record migration once per mount.
  const [thisMonthPrediction, setThisMonth] = useState<Prediction | null>(null);
  const [priorPrediction, setPrior] = useState<{
    cycleKey: string;
    prediction: Prediction;
  } | null>(null);
  const [pendingGuess, setPendingGuess] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    migrateLegacyRecord(familyKey);
    setThisMonth(getPrediction(familyKey, currentCycle));
    setPrior(findPriorPrediction(familyKey, currentCycle));
    initializedRef.current = true;
  }, [familyKey, currentCycle]);

  // Resolution: if there's an unresolved prior-month prediction, compute the
  // delta NOW and persist. Snapshot uses currentCycle's unrealizedYield —
  // this slightly overcounts when resolution happens days into the new
  // month (extra accrual gets attributed to the prior month), but it's the
  // best we can do without a server cron snapshotting at month-end.
  useEffect(() => {
    if (!priorPrediction || priorPrediction.prediction.resolved) return;
    const before = priorPrediction.prediction.unrealizedYieldAtPrediction;
    const after = unrealizedYieldUsd;
    const actualUsd = Math.max(0, after - before);
    const resolved: Prediction = {
      ...priorPrediction.prediction,
      resolved: { actualUsd, resolvedAt: Math.floor(Date.now() / 1000) },
    };
    savePrediction(familyKey, priorPrediction.cycleKey, resolved);
    setPrior({ cycleKey: priorPrediction.cycleKey, prediction: resolved });
  }, [priorPrediction, unrealizedYieldUsd, familyKey]);

  // Chips for the CURRENT cycle. Re-roll layout when family or cycle changes.
  const chips = useMemo(
    () => scaleChips(principalUsd, `${familyKey}|${currentCycle}`),
    [principalUsd, familyKey, currentCycle]
  );

  // ──────────── handlers ────────────

  const handlePickChip = (guess: number) => setPendingGuess(guess);

  const handleConfirmLock = () => {
    if (pendingGuess == null) return;
    const p: Prediction = {
      guess: pendingGuess,
      predictedAt: now,
      unrealizedYieldAtPrediction: unrealizedYieldUsd,
      cycleKey: currentCycle,
    };
    savePrediction(familyKey, currentCycle, p);
    setThisMonth(p);
    setPendingGuess(null);
  };

  const handlePickAgain = () => setPendingGuess(null);

  const handleShare = async () => {
    if (!priorPrediction?.prediction.resolved) return;
    setBusy(true);
    setShareError(null);
    try {
      const blob = await renderShareCard({
        kidName: kidName ?? "kid",
        monthLabel: cycleLabel(priorPrediction.cycleKey).split(" ")[0],
        guessUsd: priorPrediction.prediction.guess,
        actualUsd: priorPrediction.prediction.resolved.actualUsd,
        goalLabel: goal?.label,
        goalProgressUsd: goal?.progressUsd,
        goalTargetUsd: goal?.targetUsd,
      });
      await shareOrDownload(
        blob,
        `seedling-${kidName ?? "kid"}-${priorPrediction.cycleKey}.png`
      );
    } catch (e) {
      setShareError(
        e instanceof Error ? e.message : "couldn't generate the card"
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDismissPrior = () => {
    // Hide the resolved card; localStorage record stays for posterity.
    setPrior(null);
  };

  // ──────────── render ────────────

  if (!initializedRef.current) return null;

  const monthLong = cycleLabel(currentCycle).split(" ")[0]; // "May"

  // Priority order:
  //   prior unresolved → can't happen (auto-resolved in effect above)
  //   prior resolved   → REVEAL state
  //   thisMonth        → LOCKED state
  //   pendingGuess     → PREVIEW state
  //   otherwise        → PREDICT state
  const showReveal = priorPrediction?.prediction.resolved;
  const showLocked = !showReveal && thisMonthPrediction;
  const showPreview =
    !showReveal && !thisMonthPrediction && pendingGuess != null;
  const showPredict =
    !showReveal && !thisMonthPrediction && pendingGuess == null;

  return (
    <section className="kv-card kv-predict">
      <style dangerouslySetInnerHTML={{ __html: PREDICT_STYLES }} />

      {showPredict && (
        <>
          <div className="kv-card-eyebrow">guess for {monthLong}</div>
          <p className="kv-predict-prompt">
            how much yield will your savings earn during {monthLong}?
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
            answer revealed on the 1st of next month.
          </div>
        </>
      )}

      {showPreview && pendingGuess != null && (
        <>
          <div className="kv-card-eyebrow">lock in your {monthLong} guess?</div>
          <div className="kv-predict-locked">
            <span className="kv-predict-locked-amt">
              ${pendingGuess.toFixed(2)}
            </span>
            <span className="kv-predict-locked-hint">
              once locked, no changes until {monthLong} ends. ready?
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

      {showLocked && thisMonthPrediction && (
        <>
          <div className="kv-card-eyebrow">
            your {monthLong} guess is locked
          </div>
          <div className="kv-predict-locked">
            <span className="kv-predict-locked-amt">
              ${thisMonthPrediction.guess.toFixed(2)}
            </span>
            <span className="kv-predict-locked-hint">
              waiting until {monthLong} ends. the actual reveals on the 1st.
            </span>
          </div>
        </>
      )}

      {showReveal && priorPrediction?.prediction.resolved && (
        <>
          <div className="kv-card-eyebrow">
            how&apos;d your {cycleLabel(priorPrediction.cycleKey).split(" ")[0]}{" "}
            guess do?
          </div>
          <div className="kv-predict-versus">
            <div className="kv-predict-side">
              <span className="kv-predict-label">your guess</span>
              <span className="kv-predict-value">
                ${priorPrediction.prediction.guess.toFixed(2)}
              </span>
            </div>
            <span className="kv-predict-vs">vs</span>
            <div className="kv-predict-side">
              <span className="kv-predict-label">actual</span>
              <span className="kv-predict-value kv-predict-actual">
                ${priorPrediction.prediction.resolved.actualUsd.toFixed(2)}
              </span>
            </div>
          </div>
          <div className="kv-predict-diff">
            {(() => {
              const diff = Math.abs(
                priorPrediction.prediction.guess -
                  priorPrediction.prediction.resolved.actualUsd
              );
              if (diff < 0.01) return "spot on. nice.";
              const cents = Math.round(diff * 100);
              return `off by ${cents}¢.`;
            })()}
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
              onClick={handleDismissPrior}
            >
              {thisMonthPrediction
                ? `see ${monthLong} guess`
                : `guess ${monthLong}`}
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
