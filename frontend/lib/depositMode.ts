// Per-family deposit cadence preference. Off-chain — stored in
// localStorage keyed by family pubkey. The on-chain protocol is
// indifferent to the cadence (deposit accepts any amount any time),
// this just drives UX: which form to surface, what reminders to show,
// what yield curve the year recap should plot.
//
// Three modes, picked once at family creation. Numbers are for a $50/mo
// stream rate at 8% APY (scale linearly with stream rate):
//
//   Yearly   parent deposits 12 × stream up front
//             ─→ total commitment $600, yield ≈ $24/yr (100% baseline)
//   Hybrid   parent deposits 8 × stream up front + 0.4 × stream monthly
//             for 11 months
//             ─→ total commitment $620 ($20 over yearly), yield ≈ $16.80/yr
//                (~70% of yearly) ─ honest "more than half" sweet spot
//             ─→ feels routine: $20 monthly top-up after the upfront chunk
//   Monthly  parent deposits stream every month
//             ─→ total commitment $600, yield ≈ $2/yr (8% of yearly)
//             ─→ HONEST trade-off: accessibility over yield. Avg principal
//                hovers near 0 because each deposit covers that month's
//                allowance and almost nothing else accumulates.
//
// Hybrid is the recommended middle path. Tuned the upfront/monthly mix
// against the yield curve in /tmp/tune-hybrid.mjs:
//   6× + 0.6× → 55%, 7× + 0.5× → 63%, 8× + 0.4× → 70%, 9× + 0.3× → 78%
// Picked 8/0.4 because (a) 70% reads as a clear "more than half" win,
// (b) total commitment matches yearly's $600 within $20, (c) the monthly
// chunk is small enough not to feel like a subscription burden.

export type DepositMode = "yearly" | "hybrid" | "monthly";

/** Custom hybrid trajectory — parent-chosen upfront + monthly USD amounts.
 *  When undefined, depositForMonth falls back to the brand default
 *  (8× stream upfront + 0.4× stream monthly). */
export type HybridConfig = {
  upfrontUsd: number;
  monthlyUsd: number;
};

const STORAGE_KEY = "seedling.depositModes";
const HYBRID_KEY = "seedling.hybridConfigs";

type ModeMap = Record<string, DepositMode>;
type HybridMap = Record<string, HybridConfig>;

function read(): ModeMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function write(map: ModeMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota / disabled — silent. UI will fall back to "yearly".
  }
}

/** Default to yearly when no preference is set — matches the original
 *  product story and pre-existing families. */
export function getDepositMode(familyPubkey: string): DepositMode {
  const m = read()[familyPubkey];
  return m === "hybrid" || m === "monthly" ? m : "yearly";
}

export function setDepositMode(familyPubkey: string, mode: DepositMode): void {
  const map = read();
  map[familyPubkey] = mode;
  write(map);
}

export function removeDepositMode(familyPubkey: string): void {
  const map = read();
  delete map[familyPubkey];
  write(map);
}

// ──────────── hybrid config (per-family customization) ────────────

function readHybrids(): HybridMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(HYBRID_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeHybrids(map: HybridMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HYBRID_KEY, JSON.stringify(map));
  } catch {
    // silent — falls back to brand-default trajectory
  }
}

export function getHybridConfig(familyPubkey: string): HybridConfig | null {
  const v = readHybrids()[familyPubkey];
  if (
    !v ||
    typeof v.upfrontUsd !== "number" ||
    typeof v.monthlyUsd !== "number"
  ) {
    return null;
  }
  return v;
}

export function setHybridConfig(
  familyPubkey: string,
  config: HybridConfig
): void {
  const map = readHybrids();
  map[familyPubkey] = {
    upfrontUsd: Math.max(0, config.upfrontUsd),
    monthlyUsd: Math.max(0, config.monthlyUsd),
  };
  writeHybrids(map);
}

/** Brand-default hybrid trajectory: 8× stream upfront + 0.4× monthly.
 *  Recovers ~70% of yearly's yield at roughly the same total commitment. */
export function defaultHybridConfig(streamRateUsd: number): HybridConfig {
  return {
    upfrontUsd: Math.round(streamRateUsd * 8),
    monthlyUsd: Math.round(streamRateUsd * 0.4 * 100) / 100,
  };
}

// ──────────── deposit trajectory math ────────────
//
// Given a stream rate and a mode, returns the deposit amount the parent
// is expected to put into the vault during a given month index (0 = the
// family's start month, 11 = the last month of the year). The yearRecap
// uses this to plot the principal trajectory; the family card uses it
// to decide what "next deposit due" amount to show.

export function depositForMonth(
  mode: DepositMode,
  monthIndex: number,
  streamRateUsd: number,
  hybridConfig?: HybridConfig | null
): number {
  if (monthIndex < 0 || monthIndex > 11) return 0;
  const stream = Math.max(0, streamRateUsd);
  if (mode === "yearly") {
    // Single deposit at month 0 = 12× stream rate.
    return monthIndex === 0 ? stream * 12 : 0;
  }
  if (mode === "hybrid") {
    // Parent-customized config takes precedence; default falls back to the
    // brand sweet-spot (8× upfront + 0.4× monthly).
    const cfg = hybridConfig ?? defaultHybridConfig(stream);
    if (monthIndex === 0) return cfg.upfrontUsd;
    return cfg.monthlyUsd;
  }
  // monthly: parent matches the kid's allowance dollar-for-dollar each
  // month. Honest about being the lowest-yield mode.
  return stream;
}

/** Total over the year for budgeting / "you'll commit $X over 12 months". */
export function totalCommitmentForYear(
  mode: DepositMode,
  streamRateUsd: number,
  hybridConfig?: HybridConfig | null
): number {
  let total = 0;
  for (let i = 0; i < 12; i++) {
    total += depositForMonth(mode, i, streamRateUsd, hybridConfig);
  }
  return total;
}

/** For the AddKidForm trade-off blurb. Returns rough expected annual
 *  yield in USD assuming 8% APY across the year, calculated from the
 *  same trajectory yearRecap will plot. */
export function estimatedAnnualYield(
  mode: DepositMode,
  streamRateUsd: number,
  apyPct = 8,
  hybridConfig?: HybridConfig | null
): number {
  // Walk the trajectory month-by-month, average the principal during
  // each month, multiply by (apy * days/365). Same model as yearRecap
  // but without the seeded jitter — gives a clean "expected" number.
  let principal = 0;
  let yieldUsd = 0;
  const apyEff = apyPct / 100;
  for (let i = 0; i < 12; i++) {
    const deposit = depositForMonth(mode, i, streamRateUsd, hybridConfig);
    principal += deposit;
    const startPrincipal = principal;
    const endPrincipal = Math.max(0, principal - streamRateUsd);
    const avg = (startPrincipal + endPrincipal) / 2;
    // Approximate days/365 = 1/12 each month (close enough for display).
    yieldUsd += (avg * apyEff) / 12;
    principal = endPrincipal;
  }
  return Math.round(yieldUsd * 100) / 100;
}

/** Human label for a mode — for buttons, badges, etc. */
export function modeLabel(mode: DepositMode): string {
  if (mode === "yearly") return "Yearly";
  if (mode === "hybrid") return "Hybrid";
  return "Monthly";
}

/** One-line marketing description per mode. */
export function modeDescription(mode: DepositMode): string {
  if (mode === "yearly") return "One deposit. Maximum yield.";
  if (mode === "hybrid") return "Half upfront, top up monthly.";
  return "Pay-as-you-go. Small commitment.";
}
