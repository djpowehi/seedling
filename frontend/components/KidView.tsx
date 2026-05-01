"use client";

// Kid view — public, read-only, mobile-first.
// Source: Claude Design pass on Day 10. Single-column 480px max.
// Tree dominates above the fold.

import { useEffect, useRef, useState } from "react";
import { Connection } from "@solana/web3.js";
import { DEVNET_ADDRESSES, DEVNET_RPC } from "@/lib/program";
import {
  cycleLabel,
  fetchFamilyByPda,
  fetchVaultClock,
} from "@/lib/fetchFamilyByPda";
import type { FamilyView } from "@/lib/fetchFamilies";
import { getSavingsGoals, type SavingsGoal } from "@/lib/savingsGoals";
import { Tree, stageForMonths, monthsSince } from "@/components/Tree";
import { GiftModal } from "@/components/GiftModal";
import { PredictionCard } from "@/components/PredictionCard";
import { YearRecap } from "@/components/YearRecap";
import { fetchGifts, type GiftEntry } from "@/lib/fetchGifts";
import { getGiftNames, shortPubkey, timeAgo } from "@/lib/giftNames";
import { currentCycleKey, getPrediction } from "@/lib/predictions";
import { useToast } from "@/components/Toast";

const ESTIMATED_APY = 0.08;
const YEAR_SECONDS = 365 * 86_400;
const MONTH_SECONDS = 30 * 86_400;
const RECALIBRATE_MS = 30_000;
const TICK_MS = 100;

type Props = {
  family: FamilyView;
  initialClock: {
    totalShares: bigint;
    lastKnownTotalAssets: bigint;
    periodEndTs: number;
    currentPeriodId: number;
    cycleMonths: number;
  };
  kidName: string | null;
};

function fmt2(n: number): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtTicker(n: number): { whole: string; dec: string } {
  // 6 decimals = sub-microsecond resolution at 8% APY on $30 (~$0.0007/min).
  // The trailing two digits flicker constantly — drives the "money is
  // growing every instant" feeling.
  const [whole, dec = "000000"] = n.toFixed(6).split(".");
  const wholeFormatted = Number(whole).toLocaleString("en-US");
  return { whole: "$" + wholeFormatted, dec: "." + dec };
}

function computeFamilyAssetsBaseUnits(
  shares: bigint,
  totalShares: bigint,
  totalAssets: bigint
): bigint {
  if (totalShares === BigInt(0)) return BigInt(0);
  return (shares * totalAssets) / totalShares;
}

export function KidView({ family, initialClock, kidName }: Props) {
  // ───── ticker (share-math + 8% projection between recalibrations) ─────
  const initialFamilyAssets = computeFamilyAssetsBaseUnits(
    BigInt(family.shares.toString()),
    initialClock.totalShares,
    initialClock.lastKnownTotalAssets
  );
  const [snapshot, setSnapshot] = useState({
    familyAssets: initialFamilyAssets,
    snapshotMs: Date.now(),
  });
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [displayUsd, setDisplayUsd] = useState(
    () => Number(initialFamilyAssets) / 1_000_000
  );

  useEffect(() => {
    let cancelled = false;
    const connection = new Connection(DEVNET_RPC, "confirmed");
    const recalibrate = async () => {
      try {
        const [fam, clk] = await Promise.all([
          fetchFamilyByPda(connection, family.pubkey),
          fetchVaultClock(connection, DEVNET_ADDRESSES.vaultConfig),
        ]);
        if (cancelled || !fam || !clk) return;
        setSnapshot({
          familyAssets: computeFamilyAssetsBaseUnits(
            BigInt(fam.shares.toString()),
            clk.totalShares,
            clk.lastKnownTotalAssets
          ),
          snapshotMs: Date.now(),
        });
      } catch {
        // silent retry on next interval
      }
    };
    const interval = setInterval(recalibrate, RECALIBRATE_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [family.pubkey]);

  useEffect(() => {
    const tick = () => {
      const s = snapshotRef.current;
      const elapsedSec = (Date.now() - s.snapshotMs) / 1000;
      const familyAssetsUsd = Number(s.familyAssets) / 1_000_000;
      const perSec = (familyAssetsUsd * ESTIMATED_APY) / YEAR_SECONDS;
      setDisplayUsd(familyAssetsUsd + perSec * elapsedSec);
    };
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // ───── countdowns ─────
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  const lastDist = Number(family.lastDistribution.toString());
  const nextAllowanceAt = lastDist + MONTH_SECONDS;
  const monthlyDelta = Math.max(0, nextAllowanceAt - now);
  const monthlyDays = Math.floor(monthlyDelta / 86_400);
  const monthlyHours = Math.floor((monthlyDelta % 86_400) / 3_600);
  const monthlyReady = monthlyDelta === 0;
  const bonusDelta = Math.max(0, initialClock.periodEndTs - now);
  const bonusDays = Math.floor(bonusDelta / 86_400);
  const monthlyAllowanceUsd = Number(family.streamRate.toString()) / 1_000_000;

  // ───── goals + balances ─────
  const familyKey = family.pubkey.toBase58();
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  useEffect(() => {
    setGoals(getSavingsGoals(familyKey));
  }, [familyKey]);

  const principalUsd = Number(family.principalRemaining.toString()) / 1_000_000;
  // "Earned in yield" reads as the LIVE unrealized yield — same number that's
  // ticking in the hero ($familyValue - principal). The chain field
  // `totalYieldEarned` only updates at monthly distribute events, so reading
  // it here would show $0 forever until the first distribute fires. Using
  // the live delta keeps the stat tile in sync with what the kid sees ticking.
  const yieldEarnedUsd = Math.max(0, displayUsd - principalUsd);
  // Combined balance = the live ticker value (already principal + yield).
  const combinedBalanceUsd = displayUsd;
  // Time-based stage: rewards loyalty regardless of allowance size. Every
  // family hits stage 12 (mature, flowering) by month 11 — egalitarian.
  const createdAtSec = Number(family.createdAt.toString());
  const stage = stageForMonths(monthsSince(createdAtSec, now));
  // Celebration state — separate from stage. Fires when the year-end bonus
  // is actually claimable on chain. Falls back to the time-based stage
  // after the bonus is distributed.
  const bonusReady =
    now >= initialClock.periodEndTs &&
    family.lastBonusPeriodId < initialClock.currentPeriodId;

  const ticker = fmtTicker(displayUsd);
  const greetingName = kidName ?? "friend";

  const [giftOpen, setGiftOpen] = useState(false);

  // Predict-and-reveal: hide the "earned in yield" stat tile UNLESS the
  // CURRENT month's prediction is locked (or no prior month is awaiting
  // reveal). New kids see "— · —" until they commit a guess for this
  // calendar month. After locking, the tile stays hidden the rest of the
  // month so the kid doesn't watch the answer accumulate live. After
  // month rollover, the prior cycle resolves and the tile reappears.
  const [hideYield, setHideYield] = useState(true);
  useEffect(() => {
    const check = () => {
      const cycle = currentCycleKey();
      const thisMonth = getPrediction(familyKey, cycle);
      // Show the live yield only when the kid has locked this month's
      // guess. After rollover the prior-month resolved card replaces
      // this UI altogether (PredictionCard handles that), and the kid is
      // free to see the live tile again until next predict.
      setHideYield(!thisMonth);
    };
    check();
    const id = setInterval(check, 2_000);
    return () => clearInterval(id);
  }, [familyKey]);

  // ───── gift wall (gifts only — top-ups by parent are filtered out) ─────
  const [gifts, setGifts] = useState<GiftEntry[]>([]);
  const [giftsLoading, setGiftsLoading] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({});
  // Drive timeAgo updates: tick `now` every 30s so the timestamps refresh
  // without a full refetch. Distinct from the 1s `now` already used for
  // countdowns — gifts don't need second precision.
  const [walClockSec, setWallClockSec] = useState(() =>
    Math.floor(Date.now() / 1000)
  );
  useEffect(() => {
    const id = setInterval(
      () => setWallClockSec(Math.floor(Date.now() / 1000)),
      30_000
    );
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setNames(getGiftNames(familyKey));
  }, [familyKey]);
  // Toast on the FIRST sight of any new gift sig. The first poll seeds the
  // baseline silently — only gifts that arrive while the kid is watching
  // fire a notification. This is the "grandma sent you $20!" demo moment.
  const seenGiftSigs = useRef<Set<string>>(new Set());
  const giftsSeeded = useRef(false);
  const { showToast } = useToast();
  useEffect(() => {
    let cancelled = false;
    const conn = new Connection(DEVNET_RPC, "confirmed");
    const load = async () => {
      try {
        const list = await fetchGifts(conn, family.pubkey, family.parent);
        if (cancelled) return;
        // Toast on each NEW sig after baseline. Pick a name with the same
        // three-tier resolution the wall uses.
        if (giftsSeeded.current) {
          const currentNames = getGiftNames(familyKey);
          for (const g of list) {
            if (seenGiftSigs.current.has(g.sig)) continue;
            seenGiftSigs.current.add(g.sig);
            const who = g.fromName ?? currentNames[g.depositor] ?? "Someone";
            showToast({
              title: `${who} sent you $${g.amountUsd.toFixed(2)}`,
              subtitle: "A GIFT JUST LANDED",
            });
          }
        } else {
          for (const g of list) seenGiftSigs.current.add(g.sig);
          giftsSeeded.current = true;
        }
        setGifts(list);
        setGiftsLoading(false);
      } catch {
        if (!cancelled) setGiftsLoading(false);
        // Silent retry on next interval. RPC blips shouldn't blank the wall.
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [family.pubkey, family.parent, familyKey, showToast]);

  return (
    <div className="kv-page">
      <style dangerouslySetInnerHTML={{ __html: KID_VIEW_STYLES }} />
      <div className="kv-frame">
        <header className="kv-header">
          <div className="kv-eyebrow">
            <span className="kv-pulse"></span>
            kid · seedling
          </div>
          <h1 className="kv-greeting">
            hi <em>{greetingName}</em>
          </h1>
        </header>

        {bonusReady && (
          <YearRecap
            familyKey={familyKey}
            kidName={kidName}
            createdAtSec={createdAtSec}
            monthlyStreamRateUsd={monthlyAllowanceUsd}
            bonusReady={bonusReady}
          />
        )}

        {/* Ticker FIRST — it's the kid's most important on-screen number.
            Tree comes second as the celebratory visual, not the lead. */}
        <section className="kv-ticker">
          <div className="kv-ticker-label">your money, right now</div>
          <div className="kv-ticker-num">
            <span className="kv-ticker-whole">{ticker.whole}</span>
            {hideYield ? (
              <span className="kv-ticker-dec kv-ticker-hidden">.••••••</span>
            ) : (
              <span className="kv-ticker-dec">{ticker.dec}</span>
            )}
          </div>
          <div className="kv-ticker-sub">
            <span className="kv-tick-dot"></span>
            {hideYield
              ? "make your guess to see the cents"
              : "estimated 8% APY · ticking on Solana"}
          </div>
        </section>

        <div className="kv-tree-wrap">
          <Tree stage={stage} bonusReady={bonusReady} />
        </div>

        <section className="kv-stats">
          <div className="kv-stat">
            <div className="kv-stat-label">your savings</div>
            <div className="kv-stat-value">{fmt2(principalUsd)}</div>
            <div className="kv-stat-foot">from your family</div>
          </div>
          <div className="kv-stat">
            <div className="kv-stat-label">earned in yield</div>
            <div className="kv-stat-value">
              {hideYield ? (
                <span className="kv-stat-hidden">— · —</span>
              ) : (
                fmt2(yieldEarnedUsd)
              )}
            </div>
            <div className="kv-stat-foot">
              {hideYield ? "make your guess first" : "since you started"}
            </div>
          </div>
        </section>

        <section className="kv-card kv-countdowns">
          <div className="kv-card-eyebrow">what&apos;s coming</div>

          <div className="kv-countdown-row">
            <div className="kv-cd-left">
              <div className="kv-cd-label">next allowance</div>
              <div className="kv-cd-hint">
                {fmt2(monthlyAllowanceUsd)} on the 1st
              </div>
            </div>
            <div className="kv-cd-time">
              {monthlyReady ? (
                <span className="kv-cd-num">ready!</span>
              ) : (
                <>
                  <span className="kv-cd-num">{monthlyDays}</span>
                  <span className="kv-cd-unit">d</span>
                  <span className="kv-cd-num kv-cd-h">{monthlyHours}</span>
                  <span className="kv-cd-unit">h</span>
                </>
              )}
            </div>
          </div>

          <div className="kv-countdown-divider"></div>

          <div className="kv-countdown-row">
            <div className="kv-cd-left">
              <div className="kv-cd-label">annual bonus</div>
              <div className="kv-cd-hint">year-end yield gift</div>
            </div>
            <div className="kv-cd-time">
              {bonusReady ? (
                <span className="kv-cd-num">ready!</span>
              ) : (
                <>
                  <span className="kv-cd-num">{bonusDays}</span>
                  <span className="kv-cd-unit">d</span>
                </>
              )}
            </div>
          </div>
        </section>

        <PredictionCard
          familyKey={familyKey}
          kidName={kidName}
          principalUsd={principalUsd}
          createdAtSec={createdAtSec}
          goal={
            goals[0]
              ? {
                  label: goals[0].label,
                  progressUsd: combinedBalanceUsd,
                  targetUsd: goals[0].amountUsd,
                }
              : undefined
          }
        />

        <button
          type="button"
          className="kv-gift-cta"
          onClick={() => setGiftOpen(true)}
        >
          <span className="kv-gift-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path
                d="M3 11h18v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9Z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M2 7h20v4H2zM12 7v14M12 7c-2.5-3-5-3-5-1s2.5 1 5 1Zm0 0c2.5-3 5-3 5-1s-2.5 1-5 1Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="kv-gift-text">
            <span className="kv-gift-line">send a gift</span>
            <span className="kv-gift-hint">grandma · auntie · anyone</span>
          </span>
          <span className="kv-gift-arrow" aria-hidden="true">
            →
          </span>
        </button>

        {(giftsLoading || gifts.length > 0) && (
          <section className="kv-card kv-gift-wall">
            <div className="kv-card-eyebrow">gifts received</div>
            <ul className="kv-wall-list">
              {giftsLoading
                ? // Skeleton placeholder rows during the initial fetch — keeps
                  // the section visible from first paint instead of popping in
                  // 3s later.
                  Array.from({ length: 3 }).map((_, i) => (
                    <li
                      key={`skeleton-${i}`}
                      className="kv-wall-row kv-wall-row-skeleton"
                    >
                      <span className="kv-wall-skeleton-name" />
                      <span className="kv-wall-skeleton-amount" />
                      <span className="kv-wall-skeleton-when" />
                    </li>
                  ))
                : gifts.slice(0, 8).map((g) => {
                    // Three-tier fallback:
                    //   1. gifter's self-chosen name (from memo, on-chain)
                    //   2. parent's localStorage override
                    //   3. truncated wallet address
                    const display =
                      g.fromName ??
                      names[g.depositor] ??
                      shortPubkey(g.depositor);
                    void walClockSec; // dependency: keeps timeAgo current
                    return (
                      <li key={g.sig} className="kv-wall-row">
                        <span className="kv-wall-who">{display}</span>
                        <span className="kv-wall-amount">
                          {fmt2(g.amountUsd)}
                        </span>
                        <span className="kv-wall-when">{timeAgo(g.ts)}</span>
                      </li>
                    );
                  })}
            </ul>
          </section>
        )}

        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} balanceUsd={combinedBalanceUsd} />
        ))}

        {!bonusReady && (
          <YearRecap
            familyKey={familyKey}
            kidName={kidName}
            createdAtSec={createdAtSec}
            monthlyStreamRateUsd={monthlyAllowanceUsd}
            bonusReady={bonusReady}
          />
        )}

        <GiftModal
          familyPda={familyKey}
          kidName={kidName}
          open={giftOpen}
          onClose={() => setGiftOpen(false)}
        />

        <footer className="kv-footer">
          <div className="kv-foot-mark">
            <span className="kv-foot-leaf">
              <svg viewBox="0 0 16 16" width="14" height="14">
                <path
                  d="M8 14 C 8 9, 4 7, 2 5 C 3 9, 5 12, 8 14 Z M8 14 C 8 8, 12 6, 14 4 C 13 9, 11 12, 8 14 Z"
                  fill="#3A7050"
                />
              </svg>
            </span>
            powered by <span className="kv-foot-name">seedling</span>
          </div>
          <div className="kv-foot-meta">
            {cycleLabel(initialClock.cycleMonths)} bonus · on Solana
          </div>
        </footer>
      </div>
    </div>
  );
}

function GoalCard({
  goal,
  balanceUsd,
}: {
  goal: SavingsGoal;
  balanceUsd: number;
}) {
  const [imgOk, setImgOk] = useState(true);
  const pct = Math.min(100, (balanceUsd / goal.amountUsd) * 100);
  return (
    <section className="kv-card kv-goal">
      <div className="kv-card-eyebrow">saving toward</div>
      <div className="kv-goal-body">
        <div className="kv-goal-img">
          {goal.photoUrl && imgOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={goal.photoUrl}
              alt={goal.label}
              className="kv-goal-photo"
              onError={() => setImgOk(false)}
              referrerPolicy="no-referrer"
            />
          ) : (
            <>
              <div className="kv-goal-stripes"></div>
              <div className="kv-goal-fallback">🎯</div>
            </>
          )}
        </div>
        <div className="kv-goal-info">
          <div className="kv-goal-name">{goal.label}</div>
          <div className="kv-goal-bar-wrap">
            <div className="kv-goal-bar">
              <div className="kv-goal-fill" style={{ width: `${pct}%` }}></div>
            </div>
          </div>
          <div className="kv-goal-progress">
            <span className="kv-goal-num">{fmt2(balanceUsd)}</span>
            <span className="kv-goal-of">
              of ${goal.amountUsd.toLocaleString()}
            </span>
            <span className="kv-goal-pct">{Math.round(pct)}%</span>
          </div>
        </div>
      </div>
    </section>
  );
}

const KID_VIEW_STYLES = `
  .kv-page {
    --stone-50:  #FBF8F2;
    --stone-100: #F5F0E6;
    --stone-200: #ECE4D2;
    --stone-300: #D9CFB8;
    --stone-500: #8A8169;
    --ink:       #2A2A22;
    --ink-muted: #6F6A58;
    --green-900: #1F3A2A;
    --green-800: #244A33;
    --green-700: #2E5C40;
    --green-600: #3A7050;
    --green-500: #4A8A65;
    --bark:      #5A4A36;
    --serif: var(--font-instrument-serif), 'Iowan Old Style', Georgia, serif;
    --sans:  var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif;
    --mono:  var(--font-jetbrains-mono), ui-monospace, monospace;

    min-height: 100vh;
    display: flex; justify-content: center;
    background: var(--stone-50);
    background-image: radial-gradient(circle at 1px 1px, rgba(90, 74, 54, 0.04) 1px, transparent 0);
    background-size: 22px 22px;
    color: var(--ink);
    font-family: var(--sans);
    font-size: 16px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .kv-page *, .kv-page *::before, .kv-page *::after { box-sizing: border-box; }
  .kv-frame {
    width: 100%; max-width: 480px;
    padding: 28px 24px 56px;
    display: flex; flex-direction: column; gap: 28px;
  }

  .kv-header { display: flex; flex-direction: column; gap: 14px; padding-top: 8px; }
  .kv-eyebrow {
    font-family: var(--mono);
    font-size: 13px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-muted);
    display: inline-flex; align-items: center; gap: 11px;
  }
  .kv-pulse {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--green-600);
    animation: kv-pulse 2.4s ease-out infinite;
  }
  @keyframes kv-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(58, 112, 80, 0.45); }
    70%  { box-shadow: 0 0 0 8px rgba(58, 112, 80, 0); }
    100% { box-shadow: 0 0 0 0 rgba(58, 112, 80, 0); }
  }
  .kv-greeting {
    font-family: var(--serif);
    font-weight: 400;
    font-size: 64px;
    line-height: 0.95;
    letter-spacing: -0.02em;
    color: var(--green-900);
    margin: 0;
    text-wrap: balance;
  }
  .kv-greeting em { font-style: italic; color: var(--green-700); }

  .kv-tree-wrap { position: relative; margin: -8px -12px 0; padding: 0; }
  .kv-tree-wrap svg { display: block; width: 100%; height: auto; }
  .kv-sway {
    transform-origin: 230px 300px;
    animation: kv-sway 6s ease-in-out infinite;
  }
  @keyframes kv-sway {
    0%, 100% { transform: rotate(-1.2deg); }
    50%      { transform: rotate(1.2deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .kv-sway, .kv-pulse, .kv-tick-dot,
    .kv-petal-fall, .kv-acorn-drop { animation: none; }
  }

  .kv-petal-fall {
    animation: kv-petal-fall 5s ease-in infinite;
    opacity: 0;
  }
  .kv-petal-1 { animation-delay: 0s;   }
  .kv-petal-2 { animation-delay: 1.6s; }
  .kv-petal-3 { animation-delay: 3.0s; }
  .kv-petal-4 { animation-delay: 4.2s; }
  @keyframes kv-petal-fall {
    0%   { transform: translate(0, 0) rotate(0deg);   opacity: 0; }
    10%  { opacity: 0.95; }
    100% { transform: translate(-18px, 220px) rotate(420deg); opacity: 0; }
  }
  .kv-acorn-drop {
    animation: kv-acorn-drop 4.5s cubic-bezier(0.55, 0, 0.65, 1) infinite;
  }
  @keyframes kv-acorn-drop {
    0%, 25%   { transform: translate(0, 0); opacity: 1; }
    85%       { transform: translate(-8px, 110px); opacity: 1; }
    92%       { transform: translate(-8px, 116px) scale(1.05, 0.92); }
    100%      { transform: translate(-8px, 110px); opacity: 0; }
  }

  .kv-ticker { display: flex; flex-direction: column; gap: 8px; align-items: center; text-align: center; padding: 4px 0 0; }
  .kv-ticker-label {
    font-family: var(--mono); font-size: 11px; letter-spacing: 0.18em;
    text-transform: uppercase; color: var(--ink-muted);
  }
  .kv-ticker-num {
    font-family: var(--serif); font-weight: 400;
    font-size: 68px; line-height: 1;
    letter-spacing: -0.02em;
    color: var(--green-900);
    font-variant-numeric: tabular-nums;
    display: inline-flex; align-items: baseline;
  }
  .kv-ticker-dec {
    color: var(--green-600); font-size: 0.55em;
    margin-left: 2px; letter-spacing: -0.01em;
  }
  .kv-ticker-hidden {
    color: var(--stone-500); letter-spacing: 0.05em;
    font-feature-settings: "tnum";
  }
  .kv-ticker-sub {
    font-family: var(--mono); font-size: 11px;
    letter-spacing: 0.06em; color: var(--ink-muted);
    display: inline-flex; align-items: center; gap: 8px;
  }
  .kv-tick-dot {
    width: 5px; height: 5px; border-radius: 50%;
    background: var(--green-500);
    animation: kv-tick 2.5s steps(1) infinite;
  }
  @keyframes kv-tick {
    0%, 90%  { opacity: 1; transform: scale(1); }
    95%      { opacity: 0.4; transform: scale(0.6); }
    100%     { opacity: 1; transform: scale(1); }
  }

  .kv-stats {
    display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
    background: var(--stone-200);
    border: 1px solid var(--stone-200);
    border-radius: 12px;
    overflow: hidden;
  }
  .kv-stat { background: var(--stone-50); padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 6px; }
  .kv-stat-label {
    font-family: var(--mono); font-size: 10.5px;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--ink-muted);
  }
  .kv-stat-value {
    font-family: var(--serif); font-size: 32px; line-height: 1.05;
    letter-spacing: -0.01em; color: var(--green-900);
    font-variant-numeric: tabular-nums;
  }
  .kv-stat-foot { font-size: 12px; color: var(--ink-muted); margin-top: 2px; }

  .kv-card {
    background: var(--stone-50);
    border: 1px solid var(--stone-200);
    border-radius: 14px;
    padding: 18px 18px 20px;
    display: flex; flex-direction: column; gap: 14px;
  }
  /* Per-section tints so each card reads as a different "world" instead
     of a wall of identical cream rectangles. Subtle — stays in the warm
     palette, doesn't fight the brand. STBR feedback Apr 28. */
  .kv-card.kv-countdowns {
    background: linear-gradient(135deg, #FBF8F2 0%, #E5EFE3 100%);
    border-color: #C5D9C2;
  }
  .kv-card.kv-predict {
    background: linear-gradient(135deg, #FBF8F2 0%, #F5E8C0 100%);
    border-color: #D9C088;
  }
  .kv-card.kv-gift-wall {
    background: linear-gradient(135deg, #FBF8F2 0%, #F0E0CB 100%);
    border-color: #D6BB97;
  }
  .kv-card.kv-goal {
    background: linear-gradient(135deg, #FBF8F2 0%, #ECE4D2 100%);
    border-color: var(--stone-300);
  }
  .kv-card-eyebrow {
    font-family: var(--mono); font-size: 10.5px;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--ink-muted);
  }

  .kv-countdown-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
  .kv-cd-left { display: flex; flex-direction: column; gap: 4px; }
  .kv-cd-label {
    font-family: var(--serif); font-size: 22px; line-height: 1.1;
    color: var(--green-900); letter-spacing: -0.005em;
  }
  .kv-cd-label sup { font-size: 0.55em; letter-spacing: 0; vertical-align: super; }
  .kv-cd-hint {
    font-family: var(--mono); font-size: 11px;
    color: var(--ink-muted); letter-spacing: 0.04em;
  }
  .kv-cd-time {
    display: inline-flex; align-items: baseline;
    font-family: var(--serif);
    color: var(--green-700);
    font-variant-numeric: tabular-nums;
  }
  .kv-cd-num { font-size: 36px; line-height: 1; letter-spacing: -0.02em; }
  .kv-cd-h { margin-left: 6px; font-size: 28px; color: var(--green-600); }
  .kv-cd-unit { font-family: var(--mono); font-size: 12px; color: var(--ink-muted); margin-left: 2px; letter-spacing: 0.04em; }
  .kv-countdown-divider { height: 1px; background: var(--stone-200); margin: 0 -2px; }

  .kv-goal-body {
    display: grid; grid-template-columns: 96px 1fr; gap: 16px;
    align-items: center;
  }
  .kv-goal-img {
    position: relative; width: 96px; height: 96px;
    border-radius: 8px;
    border: 1px solid var(--stone-200);
    background: var(--stone-100);
    overflow: hidden;
    display: flex; align-items: center; justify-content: center;
  }
  .kv-goal-photo { width: 100%; height: 100%; object-fit: cover; display: block; }
  .kv-goal-stripes {
    position: absolute; inset: 0;
    background-image: repeating-linear-gradient(
      135deg,
      transparent 0, transparent 6px,
      rgba(90, 74, 54, 0.08) 6px, rgba(90, 74, 54, 0.08) 7px
    );
  }
  .kv-goal-fallback { position: relative; font-size: 32px; }
  .kv-goal-info { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .kv-goal-name {
    font-family: var(--serif); font-size: 24px; line-height: 1.1;
    color: var(--green-900); letter-spacing: -0.01em;
  }
  .kv-goal-bar-wrap { padding-top: 2px; }
  .kv-goal-bar {
    position: relative; height: 8px;
    background: var(--stone-200);
    border-radius: 99px;
    overflow: hidden;
  }
  .kv-goal-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--green-600), var(--green-700));
    border-radius: 99px;
    transition: width 800ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .kv-goal-progress {
    display: flex; align-items: baseline; gap: 6px;
    font-family: var(--mono); font-size: 12px;
    color: var(--ink-muted); letter-spacing: 0.02em;
  }
  .kv-goal-num {
    font-family: var(--serif); font-size: 17px;
    color: var(--green-900); letter-spacing: -0.005em;
    font-variant-numeric: tabular-nums;
  }
  .kv-goal-of { color: var(--ink-muted); }
  .kv-goal-pct { margin-left: auto; color: var(--green-700); font-weight: 500; }

  .kv-gift-cta {
    display: flex; align-items: center; gap: 14px;
    padding: 16px 18px;
    background: var(--stone-50);
    border: 1px solid var(--stone-200);
    border-radius: 14px;
    color: var(--green-900);
    cursor: pointer; text-align: left;
    font-family: var(--sans);
    transition: all 180ms ease;
  }
  .kv-gift-cta:hover {
    border-color: var(--green-600);
    background: var(--stone-100);
  }
  .kv-gift-icon {
    display: inline-flex; align-items: center; justify-content: center;
    width: 36px; height: 36px;
    border-radius: 10px;
    background: var(--green-700); color: var(--stone-50);
    flex-shrink: 0;
  }
  .kv-gift-text {
    display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;
  }
  .kv-gift-line {
    font-family: var(--serif); font-size: 22px; line-height: 1.1;
    letter-spacing: -0.005em; color: var(--green-900);
  }
  .kv-gift-hint {
    font-family: var(--mono); font-size: 11px;
    letter-spacing: 0.06em; color: var(--ink-muted);
  }
  .kv-gift-arrow {
    font-family: var(--serif); font-size: 22px;
    color: var(--green-700);
    transition: transform 200ms ease;
  }
  .kv-gift-cta:hover .kv-gift-arrow { transform: translateX(3px); }

  .kv-wall-list {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-direction: column;
  }
  .kv-wall-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 12px;
    align-items: baseline;
    padding: 12px 0;
    border-top: 1px dashed var(--stone-200);
  }
  .kv-wall-row:first-child { border-top: none; padding-top: 4px; }
  .kv-wall-who {
    font-family: var(--serif); font-size: 18px;
    color: var(--green-900); letter-spacing: -0.005em;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .kv-wall-amount {
    font-family: var(--mono); font-size: 13px;
    color: var(--green-700); font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }
  .kv-wall-when {
    font-family: var(--mono); font-size: 11px;
    color: var(--ink-muted); letter-spacing: 0.04em;
  }

  .kv-wall-row-skeleton { animation: kv-skeleton-pulse 1.4s ease-in-out infinite; }
  .kv-wall-skeleton-name {
    height: 18px; width: 40%;
    background: var(--stone-200); border-radius: 4px;
  }
  .kv-wall-skeleton-amount {
    height: 13px; width: 48px;
    background: var(--stone-200); border-radius: 4px;
  }
  .kv-wall-skeleton-when {
    height: 11px; width: 56px;
    background: var(--stone-200); border-radius: 4px;
  }
  @keyframes kv-skeleton-pulse {
    0%, 100% { opacity: 0.55; }
    50%      { opacity: 0.95; }
  }

  .kv-footer {
    margin-top: 12px; padding-top: 20px;
    border-top: 1px dashed var(--stone-300);
    display: flex; flex-direction: column;
    align-items: center; gap: 6px;
  }
  .kv-foot-mark {
    font-family: var(--serif); font-size: 18px;
    color: var(--green-800);
    display: inline-flex; align-items: center; gap: 8px;
    letter-spacing: -0.005em;
  }
  .kv-foot-name { font-style: italic; color: var(--green-700); }
  .kv-foot-leaf { display: inline-flex; }
  .kv-foot-meta {
    font-family: var(--mono); font-size: 10.5px;
    letter-spacing: 0.16em; text-transform: uppercase;
    color: var(--ink-muted);
  }

  @media (max-width: 380px) {
    .kv-frame { padding: 22px 18px 48px; }
    .kv-greeting { font-size: 56px; }
    .kv-ticker-num { font-size: 60px; }
  }
`;
