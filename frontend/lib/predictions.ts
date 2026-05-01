// Prediction & resolve loop for the kid view's "guess this month's yield" card.
//
// Mental model: at any time during the month, the kid can tap a guess.
// We snapshot `family.totalYieldEarned` at prediction time. When the next
// monthly distribute fires (chain-side `last_distribution` advances + the
// total_yield_earned counter ticks up), the prediction "resolves" — the
// actual yield earned during the period = totalYieldEarned_now -
// totalYieldEarned_at_prediction. The kid sees their guess vs reality.
//
// Storage: localStorage. One active prediction per family at a time.
// Resolved predictions stick around until the kid taps "predict next" to
// start a new cycle. That keeps the share card visible long enough to be
// shared without a stale-state bug.

const KEY_PREFIX = "seedling-prediction-";

export type Prediction = {
  /** Guess in dollars (the chip values: 0.10, 0.20, 0.50, 1.00). */
  guess: number;
  /** Unix seconds the kid tapped. */
  predictedAt: number;
  /** Live unrealized yield at prediction time, in DOLLARS (not base units).
   *  Computed as (familyValue - principalRemaining) — same number the kid
   *  was looking at in the "earned in yield" stat tile. The next monthly
   *  distribute pays out from PRINCIPAL ONLY (principal-first drawdown),
   *  so the unrealized-yield meter keeps ticking until the 13th allowance.
   *  Reveal compares this snapshot against the same delta after the next
   *  distribute fires. */
  unrealizedYieldAtPrediction: number;
  /** Filled in once a distribute fires and we compute the actual delta. */
  resolved?: {
    /** Actual yield earned during the period in dollars. */
    actualUsd: number;
    /** Unix seconds we resolved (= last_distribution at resolve time). */
    resolvedAt: number;
  };
};

export function getPrediction(familyPda: string): Prediction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + familyPda);
    return raw ? (JSON.parse(raw) as Prediction) : null;
  } catch {
    return null;
  }
}

export function savePrediction(familyPda: string, p: Prediction): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_PREFIX + familyPda, JSON.stringify(p));
  } catch {
    // Quota / disabled — silent. Worst case: prediction not persisted.
  }
}

export function clearPrediction(familyPda: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY_PREFIX + familyPda);
  } catch {
    // ignore
  }
}
