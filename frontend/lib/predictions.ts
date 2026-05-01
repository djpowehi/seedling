// Prediction & resolve loop for the kid view's "guess this month's yield" card.
//
// Mental model: each calendar month is a discrete cycle. During the current
// month the kid can tap a guess; once the month rolls over, the previous
// month's prediction resolves automatically on next page load. Distribute
// events are completely decoupled — yield accrues regardless of when (or if)
// the parent fires a monthly distribute, and the unrealized-yield meter is
// what we predict against.
//
// Storage key includes the cycle so each month gets its own slot:
//
//   seedling-prediction-<familyPda>-<YYYY-MM>
//
// New cycle = new key = predict prompt shows again automatically. The
// previous cycle's record sticks around just long enough to render the
// resolved-state card with the share button, then can be archived.

const KEY_PREFIX = "seedling-prediction-";
// One-time cleanup target: pre-cycle-key records lived at this exact key.
const LEGACY_KEY_PREFIX = "seedling-prediction-";

export type Prediction = {
  /** Guess in dollars. */
  guess: number;
  /** Unix seconds the kid tapped. */
  predictedAt: number;
  /** Live unrealized yield at prediction time (familyValue - principal),
   *  in dollars. Resolution = (currentUnrealizedYield − this) when the
   *  month rolls over. */
  unrealizedYieldAtPrediction: number;
  /** Calendar-month key the prediction was made FOR (YYYY-MM). */
  cycleKey: string;
  /** Filled in once the cycle ends and we compute the actual delta. */
  resolved?: {
    actualUsd: number;
    /** Unix seconds we resolved (= first page load after the cycle ended). */
    resolvedAt: number;
  };
};

/** Calendar-month cycle key — `YYYY-MM` from a unix timestamp. */
export function cycleKeyFromUnix(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

/** Current month's cycle key. */
export function currentCycleKey(): string {
  return cycleKeyFromUnix(Math.floor(Date.now() / 1000));
}

/** Human label for a cycle key — "May 2026" / "June 2026". */
export function cycleLabel(cycleKey: string): string {
  const [yy, mm] = cycleKey.split("-");
  const d = new Date(Number(yy), Number(mm) - 1, 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function fullKey(familyPda: string, cycleKey: string): string {
  return `${KEY_PREFIX}${familyPda}-${cycleKey}`;
}

export function getPrediction(
  familyPda: string,
  cycleKey: string
): Prediction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(fullKey(familyPda, cycleKey));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<Prediction>;
    if (
      typeof p.unrealizedYieldAtPrediction !== "number" ||
      typeof p.guess !== "number" ||
      typeof p.predictedAt !== "number" ||
      typeof p.cycleKey !== "string"
    ) {
      window.localStorage.removeItem(fullKey(familyPda, cycleKey));
      return null;
    }
    return p as Prediction;
  } catch {
    return null;
  }
}

export function savePrediction(
  familyPda: string,
  cycleKey: string,
  p: Prediction
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      fullKey(familyPda, cycleKey),
      JSON.stringify(p)
    );
  } catch {
    // Quota / disabled — silent.
  }
}

export function clearPrediction(familyPda: string, cycleKey: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(fullKey(familyPda, cycleKey));
  } catch {
    // ignore
  }
}

/** Find the most recent prior cycle's prediction (last 6 months). Used to
 *  resolve the previous cycle when it has rolled over. Returns the cycle
 *  key alongside so callers can update the same record. */
export function findPriorPrediction(
  familyPda: string,
  currentCycle: string
): { cycleKey: string; prediction: Prediction } | null {
  if (typeof window === "undefined") return null;
  // Walk back month by month, up to 6 months — enough to handle a kid who
  // skipped a couple months and now opens the page.
  const [cy, cm] = currentCycle.split("-").map(Number);
  for (let back = 1; back <= 6; back++) {
    const total = cy * 12 + (cm - 1) - back;
    const py = Math.floor(total / 12);
    const pm = (total % 12) + 1;
    const key = `${py}-${String(pm).padStart(2, "0")}`;
    const p = getPrediction(familyPda, key);
    if (p) return { cycleKey: key, prediction: p };
  }
  return null;
}

/** One-time migration: pre-cycle-key shape lived at the bare key
 *  `seedling-prediction-<familyPda>` (no cycle suffix). Drop those — they
 *  can't be resolved correctly under the new model. Safe to call on every
 *  mount; it's a no-op once the legacy record is gone. */
export function migrateLegacyRecord(familyPda: string): void {
  if (typeof window === "undefined") return;
  try {
    const legacy = window.localStorage.getItem(
      `${LEGACY_KEY_PREFIX}${familyPda}`
    );
    if (!legacy) return;
    // The legacy key is identical to the cycle-keyed prefix without the
    // `-YYYY-MM` suffix. Distinguish by checking whether the value is the
    // legacy shape (no cycleKey field) versus a current cycle's record.
    const parsed = JSON.parse(legacy) as Partial<Prediction>;
    if (typeof parsed.cycleKey !== "string") {
      window.localStorage.removeItem(`${LEGACY_KEY_PREFIX}${familyPda}`);
    }
  } catch {
    // Bad JSON — purge.
    try {
      window.localStorage.removeItem(`${LEGACY_KEY_PREFIX}${familyPda}`);
    } catch {
      /* noop */
    }
  }
}
