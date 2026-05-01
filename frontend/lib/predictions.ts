// Yield prediction loop on the kid view — synchronous, calendar-month based.
//
// Today is May → question is "how much did your savings earn in April?"
// Kid guesses → answer reveals immediately. No async waiting on distributes,
// no chain reads, no "lock and resolve later." Each calendar month is a
// self-contained mini-game.
//
// Storage: just the kid's GUESS for the current cycle, so a refresh doesn't
// reset back to the prompt. The "actual" is recomputed every render from
// principal × 8% APY × days-in-last-month, with seeded jitter so it varies
// month to month and family to family without being predictable.
//
// Storage key:  seedling-prediction-<familyPda>-<YYYY-MM>
//
// New cycle = new key = predict prompt shows again.

const KEY_PREFIX = "seedling-prediction-";

export type Prediction = {
  /** Kid's guess in dollars. */
  guess: number;
  /** Unix seconds the kid tapped. */
  predictedAt: number;
  /** Calendar-month key the prediction was made FOR (YYYY-MM). */
  cycleKey: string;
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

/** Cycle key for the month BEFORE the current one — that's the month the
 *  kid is being asked to predict. */
export function previousCycleKey(currentCycle: string): string {
  const [cy, cm] = currentCycle.split("-").map(Number);
  const prevTotal = cy * 12 + (cm - 1) - 1;
  const py = Math.floor(prevTotal / 12);
  const pm = (prevTotal % 12) + 1;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

/** Human label for a cycle key — "May 2026" / "June 2026". */
export function cycleLabel(cycleKey: string): string {
  const [yy, mm] = cycleKey.split("-");
  const d = new Date(Number(yy), Number(mm) - 1, 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

/** Days in the calendar month identified by cycleKey. */
export function daysInCycle(cycleKey: string): number {
  const [yy, mm] = cycleKey.split("-").map(Number);
  // new Date(year, month, 0) gives the last day of the previous month, which
  // happens to equal the number of days in `mm` (since mm here is 1-indexed
  // and the Date ctor wants 0-indexed).
  return new Date(yy, mm, 0).getDate();
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

// ──────────── seeded RNG for the deterministic "actual" computation ────────

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

/**
 * Compute the simulated "actual yield" for a given calendar month, given
 * the family's principal. Honest framing: this is what the savings WOULD
 * have earned at Kamino's ~8% APY for the days in that month, with a
 * small seeded jitter so the answer feels real rather than perfectly clean.
 *
 *   $30 principal, April (30 days):  base $0.20 → jittered $0.18 - $0.22
 *   $300 principal, March (31 days): base $2.04 → jittered $1.83 - $2.24
 *
 * Deterministic given (principal, cycleKey, familyPda) — no need to store
 * the result. Refresh shows the same answer.
 */
export function computeActualYield(
  principalUsd: number,
  cycleKey: string,
  familyPda: string
): number {
  const days = daysInCycle(cycleKey);
  const base = (principalUsd * 0.08 * days) / 365;
  const rng = mulberry32(seedFromString(`actual|${familyPda}|${cycleKey}`));
  // ±15% jitter — feels organic without being absurd.
  const jitter = 0.85 + rng() * 0.3;
  const jittered = base * jitter;
  // Round to 2 decimals for sub-dollar amounts, 1 decimal for sub-$10,
  // integer otherwise. Same magnitude rules as the chip set.
  if (jittered < 1) return Math.max(0, Math.round(jittered * 100) / 100);
  if (jittered < 10) return Math.max(0, Math.round(jittered * 10) / 10);
  return Math.max(0, Math.round(jittered));
}

/** One-time migration: drop pre-cycle-key records that lived at the bare
 *  key `seedling-prediction-<familyPda>` and any cycle-keyed records from
 *  the old "wait for distribute" model that included the
 *  `unrealizedYieldAtPrediction` field. Safe to call on every mount. */
export function migrateLegacyRecord(familyPda: string): void {
  if (typeof window === "undefined") return;
  try {
    const bare = `${KEY_PREFIX}${familyPda}`;
    const legacy = window.localStorage.getItem(bare);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<Prediction>;
      if (typeof parsed.cycleKey !== "string") {
        window.localStorage.removeItem(bare);
      }
    }
    // Sweep cycle-keyed records that have the old shape (with
    // unrealizedYieldAtPrediction). They're indistinguishable from current
    // shape at parse time except for that extra field.
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(`${KEY_PREFIX}${familyPda}-`)) continue;
      try {
        const v = window.localStorage.getItem(key);
        if (!v) continue;
        const parsed = JSON.parse(v) as Partial<Prediction> & {
          unrealizedYieldAtPrediction?: number;
        };
        if (typeof parsed.unrealizedYieldAtPrediction === "number") {
          window.localStorage.removeItem(key);
        }
      } catch {
        window.localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}
