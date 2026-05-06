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

/** Human label for a cycle key — "May 2026" / "Maio de 2026". Locale-aware. */
export function cycleLabel(cycleKey: string, locale: string = "en-US"): string {
  const [yy, mm] = cycleKey.split("-");
  const d = new Date(Number(yy), Number(mm) - 1, 1);
  return d.toLocaleString(locale, { month: "long", year: "numeric" });
}

/** Just the month name from a cycle key — "April" / "Abril". Locale-aware. */
export function cycleMonthLabel(
  cycleKey: string,
  locale: string = "en-US"
): string {
  const [yy, mm] = cycleKey.split("-");
  const d = new Date(Number(yy), Number(mm) - 1, 1);
  return d.toLocaleString(locale, { month: "long" });
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

function roundChip(v: number): number {
  // Two decimals for sub-dollar, one for sub-$10, integer otherwise.
  // Apply the same rounding to actual + chips so chip values can match
  // the actual exactly.
  if (v < 1) return Math.max(0, Math.round(v * 100) / 100);
  if (v < 10) return Math.max(0, Math.round(v * 10) / 10);
  return Math.max(0, Math.round(v));
}

/**
 * Build BOTH the chip set AND the actual answer in one pass. Computed from
 * a single seeded RNG so the actual is GUARANTEED to be one of the four
 * chips (after rounding) — kid can pick "spot on" if they read the
 * magnitude correctly.
 *
 * Decoy strategy: each decoy independently rolls "smaller" or "larger"
 * with random spread. The actual is NOT always at a fixed rank — sometimes
 * smallest, sometimes middle, sometimes largest. Kid can't game by
 * picking "the second-from-bottom chip."
 *
 * Deterministic given (principal, cycleKey, familyPda) — refresh, same
 * chips, same actual.
 *
 *   $30 principal, April (30 days):
 *     base $0.20 → actual $0.18-$0.22, chips e.g. [$0.08, $0.20, $0.45, $0.78]
 *   $300 principal, March (31 days):
 *     base $2.04 → actual $1.85-$2.25, chips e.g. [$1, $2, $5.5, $7.4]
 */
export function buildChipsAndActual(
  principalUsd: number,
  targetCycleKey: string,
  familyPda: string
): { chips: number[]; actual: number } {
  const rng = mulberry32(
    seedFromString(
      `v2|${familyPda}|${targetCycleKey}|${principalUsd.toFixed(2)}`
    )
  );

  // Step 1: compute the rounded actual
  const days = daysInCycle(targetCycleKey);
  const base = Math.max(0.01, (principalUsd * 0.08 * days) / 365);
  const actualJitter = 0.85 + rng() * 0.3; // ±15%
  const rawActual = base * actualJitter;
  const actual = roundChip(rawActual);

  // Step 2: build 3 decoys with a uniform rank distribution for the
  // actual. Picking each decoy independently with 50/50 smaller/larger
  // gives a binomial skew toward ranks 2 & 3 — kid could game by always
  // picking middle. Instead, choose `numSmaller` ∈ {0, 1, 2, 3} uniformly
  // up front; that puts the actual at rank (numSmaller + 1) with equal
  // probability across the four ranks.
  const numSmaller = Math.floor(rng() * 4); // 0..3
  const numLarger = 3 - numSmaller;
  const decoys: number[] = [];
  for (let i = 0; i < numSmaller; i++) {
    // 0.3× to 0.75× of rawActual
    decoys.push(roundChip(rawActual * (0.3 + rng() * 0.45)));
  }
  for (let i = 0; i < numLarger; i++) {
    // 1.4× to 3.5× of rawActual, weighted slightly toward the lower end
    decoys.push(roundChip(rawActual * (1.4 + rng() * 2.1)));
  }

  // Step 3: combine + dedup. If dedup collapsed (rounding made decoys
  // equal to actual or each other), pad with extra random factors.
  const chipSet = new Set<number>([actual, ...decoys]);
  let attempts = 0;
  while (chipSet.size < 4 && attempts < 30) {
    const fallbackFactor = 0.2 + rng() * 4.5;
    const v = roundChip(rawActual * fallbackFactor);
    if (v > 0) chipSet.add(v);
    attempts++;
  }
  // Last-resort: nudge by one display unit until we have 4 distinct values.
  const unit = rawActual < 1 ? 0.01 : rawActual < 10 ? 0.1 : 1;
  let cursor = actual + unit;
  while (chipSet.size < 4) {
    if (!chipSet.has(cursor)) chipSet.add(cursor);
    cursor += unit;
  }

  // Step 4: Fisher-Yates shuffle (also seeded — kid can't refresh to
  // re-roll the layout).
  const chips = [...chipSet];
  for (let i = chips.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [chips[i], chips[j]] = [chips[j], chips[i]];
  }

  return { chips, actual };
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
