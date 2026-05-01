// Year recap data. Synthesizes 12 months of yield using the same seeded
// jitter approach as the monthly prediction card — but with a wider band
// per month (70%-130% of base APY), so the chart shows real-feeling
// month-over-month variation instead of a perfectly flat 8% line.
//
// Total deposited is reconstructed from the family's principal trajectory
// (assume monthly stream contributions across the year — same shape as
// what create_family + monthly distribute would produce in a steady-state
// healthy family). For the demo we don't have a full year of on-chain
// history, so we simulate; the share card explicitly frames it as the
// year-in-numbers.
//
// Determinism: same family + same year → same recap on every render.

import { cycleLabel, daysInCycle } from "@/lib/predictions";

export type MonthRecap = {
  cycleKey: string; // "2026-04"
  monthLabel: string; // "April"
  monthShort: string; // "Apr"
  yieldUsd: number; // earnings during this month
  cumulativeYieldUsd: number;
  cumulativeBalanceUsd: number; // principal + yield to date
  apyEffectiveBps: number; // for display ("8.4% APY this month")
};

export type YearRecap = {
  family: string;
  year: number;
  months: MonthRecap[]; // exactly 12, oldest → newest
  totalDepositedUsd: number;
  totalYieldedUsd: number;
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

/**
 * Build the year recap for a given family + year.
 *
 * @param familyPda                base58 string keyed for seeded jitter
 * @param year                     the calendar year being recapped
 * @param monthlyStreamRateUsd     the family's stream_rate, in dollars
 *                                 (parent allowance contribution per month)
 * @param principalAtYearStartUsd  optional principal kicked off at year start
 *                                 (default 0 — assumes no head-start)
 */
export function buildYearRecap(
  familyPda: string,
  year: number,
  monthlyStreamRateUsd: number,
  principalAtYearStartUsd: number = 0
): YearRecap {
  const rng = mulberry32(seedFromString(`recap|${familyPda}|${year}`));

  let runningPrincipal = principalAtYearStartUsd;
  let cumulativeYield = 0;

  const months: MonthRecap[] = [];

  for (let m = 1; m <= 12; m++) {
    const cycleKey = `${year}-${String(m).padStart(2, "0")}`;
    const days = daysInCycle(cycleKey);

    // Each month, the parent contributes the monthly stream → principal grows
    // BEFORE that month's interest is computed. Healthy family: principal
    // accumulates monthly because monthly distribute uses principal-first.
    runningPrincipal += monthlyStreamRateUsd;

    // Per-month APY jitter: 5%-11% effective (Kamino USDC has historically
    // moved in roughly that band). Seeded so a given (family, year, month)
    // always shows the same number.
    const apyEffective = 0.05 + rng() * 0.06;
    const monthYield = (runningPrincipal * apyEffective * days) / 365;

    cumulativeYield += monthYield;

    const round = (v: number): number =>
      v < 1
        ? Math.round(v * 100) / 100
        : v < 10
        ? Math.round(v * 10) / 10
        : Math.round(v);

    months.push({
      cycleKey,
      monthLabel: cycleLabel(cycleKey).split(" ")[0],
      monthShort: cycleLabel(cycleKey).split(" ")[0].slice(0, 3),
      yieldUsd: round(monthYield),
      cumulativeYieldUsd: round(cumulativeYield),
      cumulativeBalanceUsd: round(runningPrincipal + cumulativeYield),
      apyEffectiveBps: Math.round(apyEffective * 10000),
    });
  }

  const totalDeposited = monthlyStreamRateUsd * 12 + principalAtYearStartUsd;
  const totalYielded = months[months.length - 1].cumulativeYieldUsd;
  const percentGrowth =
    totalDeposited > 0 ? (totalYielded / totalDeposited) * 100 : 0;

  // Best / worst / average — for highlight slides.
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
    year,
    months,
    totalDepositedUsd: totalDeposited,
    totalYieldedUsd: totalYielded,
    percentGrowth,
    bestMonth,
    worstMonth,
    averageMonthYieldUsd,
  };
}
