// Year recap data. Synthesizes 12 months of yield using the same seeded
// jitter approach as the monthly prediction card — but with a wider band
// per month (5%-11% effective APY), so the chart shows real-feeling
// month-over-month variation instead of a perfectly flat 8% line.
//
// Real deposit model on chain:
//   - parent deposits the year's principal UP FRONT (typically ~12×
//     stream_rate, can be adjusted via top-ups or close)
//   - each month, distribute_monthly_allowance pays stream_rate to the
//     kid wallet, drawing from principal_remaining first
//   - yield accrues on whatever principal sits in the vault that month
//   - 13th = sum of accrued yield (paid out at year end)
//
// So the principal trajectory is DECREASING across the year, and the
// monthly yield drops with it. This is the reverse of what an "every
// month parent adds money" model would suggest.
//
// Calendar anchoring: the 12-month window starts from the family's
// creation month (not always Jan). A family created in August recaps
// Aug → next-year Jul.
//
// Determinism: same family + same start month → same recap on every render.

import { cycleLabel, daysInCycle } from "@/lib/predictions";
import { depositForMonth, type DepositMode } from "@/lib/depositMode";

export type MonthRecap = {
  cycleKey: string; // "2026-04"
  monthLabel: string; // "April"
  monthShort: string; // "Apr"
  yieldUsd: number; // earnings during this month
  cumulativeYieldUsd: number;
  principalAtMonthStartUsd: number; // pre-distribute snapshot
  principalAtMonthEndUsd: number; // post-distribute (= start - stream_rate)
  apyEffectiveBps: number; // for display ("8.4% APY this month")
};

export type YearRecap = {
  family: string;
  startCycleKey: string; // first month in the recap
  endCycleKey: string; // last month
  months: MonthRecap[]; // exactly 12, oldest → newest
  totalDepositedUsd: number; // principal deposited at year start
  totalYieldedUsd: number; // 13th — sum of monthly yields
  percentGrowth: number; // yield / deposited × 100
  bestMonth: MonthRecap;
  worstMonth: MonthRecap;
  averageMonthYieldUsd: number;
};

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

/** Walk the calendar 12 months forward starting from the given (year, month1Indexed). */
function nextTwelveCycleKeys(startYear: number, startMonth: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) {
    const total = startYear * 12 + (startMonth - 1) + i;
    const y = Math.floor(total / 12);
    const m = (total % 12) + 1;
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
}

/**
 * Build the year recap for a given family + 12-month window starting at
 * the family's creation month.
 *
 * @param familyPda             base58 string keyed for seeded jitter
 * @param createdAtUnixSec      family creation timestamp (drives the start month)
 * @param monthlyStreamRateUsd  the family's stream_rate, in dollars
 *                              (kid's monthly allowance)
 * @param mode                  deposit cadence — drives the principal
 *                              trajectory (yearly = upfront, hybrid =
 *                              half-and-monthly, monthly = matched). See
 *                              depositMode.ts for the math.
 */
export function buildYearRecap(
  familyPda: string,
  createdAtUnixSec: number,
  monthlyStreamRateUsd: number,
  mode: DepositMode = "yearly"
): YearRecap {
  const created = new Date(createdAtUnixSec * 1000);
  const startYear = created.getFullYear();
  const startMonth = created.getMonth() + 1;
  const cycleKeys = nextTwelveCycleKeys(startYear, startMonth);
  const startCycleKey = cycleKeys[0];
  const endCycleKey = cycleKeys[cycleKeys.length - 1];

  const stream = Math.max(0, monthlyStreamRateUsd);

  // Seed by start cycle so the same 12-month window always renders the
  // same numbers (refresh-stable).
  const rng = mulberry32(
    seedFromString(`recap|${familyPda}|${startCycleKey}|${mode}`)
  );

  const months: MonthRecap[] = [];
  let principal = 0;
  let cumulativeYield = 0;
  let totalDeposited = 0;

  const round = (v: number): number =>
    v < 1
      ? Math.round(v * 100) / 100
      : v < 10
      ? Math.round(v * 10) / 10
      : Math.round(v);

  cycleKeys.forEach((cycleKey, monthIndex) => {
    const days = daysInCycle(cycleKey);

    // Per-month APY jitter: 5%-11% effective. Seeded so a given (family,
    // window, mode, monthIndex) always shows the same number.
    const apyEffective = 0.05 + rng() * 0.06;

    // Each mode's deposit-trajectory function tells us what the parent
    // adds at the START of this month. The kid's allowance is then
    // drawn at month-end. Yield is computed on the average principal
    // across the month (post-deposit, pre-distribute average with
    // post-distribute end).
    const deposit = depositForMonth(mode, monthIndex, stream);
    totalDeposited += deposit;

    const principalAtMonthStart = principal + deposit;
    const principalAtMonthEnd = Math.max(0, principalAtMonthStart - stream);
    const avgPrincipal = (principalAtMonthStart + principalAtMonthEnd) / 2;
    const monthYield = (avgPrincipal * apyEffective * days) / 365;

    cumulativeYield += monthYield;

    months.push({
      cycleKey,
      monthLabel: cycleLabel(cycleKey).split(" ")[0],
      monthShort: cycleLabel(cycleKey).split(" ")[0].slice(0, 3),
      yieldUsd: round(monthYield),
      cumulativeYieldUsd: round(cumulativeYield),
      principalAtMonthStartUsd: round(principalAtMonthStart),
      principalAtMonthEndUsd: round(principalAtMonthEnd),
      apyEffectiveBps: Math.round(apyEffective * 10000),
    });

    principal = principalAtMonthEnd;
  });

  const roundedTotalDeposited = round(totalDeposited);
  const totalYielded = months[months.length - 1].cumulativeYieldUsd;
  const percentGrowth =
    roundedTotalDeposited > 0
      ? (totalYielded / roundedTotalDeposited) * 100
      : 0;

  let bestMonth = months[0];
  let worstMonth = months[0];
  let yieldSum = 0;
  for (const m of months) {
    if (m.yieldUsd > bestMonth.yieldUsd) bestMonth = m;
    if (m.yieldUsd < worstMonth.yieldUsd) worstMonth = m;
    yieldSum += m.yieldUsd;
  }
  const averageMonthYieldUsd =
    Math.round((yieldSum / months.length) * 100) / 100;

  return {
    family: familyPda,
    startCycleKey,
    endCycleKey,
    months,
    totalDepositedUsd: roundedTotalDeposited,
    totalYieldedUsd: totalYielded,
    percentGrowth,
    bestMonth,
    worstMonth,
    averageMonthYieldUsd,
  };
}
