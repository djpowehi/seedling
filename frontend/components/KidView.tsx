"use client";

// Kid view — public, read-only, mobile-first.
// Source: Claude Design pass on Day 10. Single-column 480px max.
// Tree dominates above the fold.

import { useEffect, useRef, useState } from "react";
import { Connection } from "@solana/web3.js";
import { DEVNET_ADDRESSES, DEVNET_RPC } from "@/lib/program";
import { fetchFamilyByPda, fetchVaultClock } from "@/lib/fetchFamilyByPda";
import type { FamilyView } from "@/lib/fetchFamilies";
import { getSavingsGoals, type SavingsGoal } from "@/lib/savingsGoals";
import { Tree, stageForMonths, monthsSince } from "@/components/Tree";

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
  const [whole, dec = "0000"] = n.toFixed(4).split(".");
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
  const yieldEarnedUsd = Number(family.totalYieldEarned.toString()) / 1_000_000;
  const combinedBalanceUsd = principalUsd + yieldEarnedUsd;
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

        <div className="kv-tree-wrap">
          <Tree stage={stage} bonusReady={bonusReady} />
        </div>

        <section className="kv-ticker">
          <div className="kv-ticker-label">your money, right now</div>
          <div className="kv-ticker-num">
            <span className="kv-ticker-whole">{ticker.whole}</span>
            <span className="kv-ticker-dec">{ticker.dec}</span>
          </div>
          <div className="kv-ticker-sub">
            <span className="kv-tick-dot"></span>
            estimated 8% APY · ticking on Solana
          </div>
        </section>

        <section className="kv-stats">
          <div className="kv-stat">
            <div className="kv-stat-label">your savings</div>
            <div className="kv-stat-value">{fmt2(principalUsd)}</div>
            <div className="kv-stat-foot">from your family</div>
          </div>
          <div className="kv-stat">
            <div className="kv-stat-label">earned in yield</div>
            <div className="kv-stat-value">{fmt2(yieldEarnedUsd)}</div>
            <div className="kv-stat-foot">since you started</div>
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
              <div className="kv-cd-label">
                13<sup>th</sup> allowance
              </div>
              <div className="kv-cd-hint">year-end yield bonus</div>
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

        {goals.map((goal) => (
          <GoalCard key={goal.id} goal={goal} balanceUsd={combinedBalanceUsd} />
        ))}

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
          <div className="kv-foot-meta">on Solana devnet</div>
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
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-muted);
    display: inline-flex; align-items: center; gap: 10px;
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
