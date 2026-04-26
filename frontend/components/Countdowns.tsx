"use client";

import { useEffect, useState } from "react";
import type { FamilyView } from "@/lib/fetchFamilies";
import type { VaultClock } from "@/lib/fetchFamilyByPda";
import { formatUsdc } from "@/lib/format";

const MONTH_SECONDS = 30 * 86_400;

type Props = {
  family: FamilyView;
  clock: VaultClock;
};

function breakdown(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  return {
    d: Math.floor(s / 86_400),
    h: Math.floor((s % 86_400) / 3_600),
    m: Math.floor((s % 3_600) / 60),
    s: s % 60,
  };
}

function formatBig({
  d,
  h,
  m,
  s,
}: {
  d: number;
  h: number;
  m: number;
  s: number;
}): { label: string; value: string } {
  if (d > 1) return { label: "days", value: `${d}` };
  if (d === 1) return { label: "day & hours", value: `1d ${h}h` };
  if (h > 0) return { label: "hours & minutes", value: `${h}h ${m}m` };
  return {
    label: "until soon!",
    value: `${m}m ${s.toString().padStart(2, "0")}s`,
  };
}

export function Countdowns({ family, clock }: Props) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1000
    );
    return () => clearInterval(interval);
  }, []);

  const lastDist = Number(family.lastDistribution.toString());
  const nextAllowanceAt = lastDist + MONTH_SECONDS;
  const nextAllowanceIn = nextAllowanceAt - now;
  const monthlyReady = nextAllowanceIn <= 0;

  const bonusIn = clock.periodEndTs - now;
  const bonusReady = bonusIn <= 0;

  const monthly = formatBig(breakdown(nextAllowanceIn));
  const bonus = formatBig(breakdown(bonusIn));

  return (
    <section className="rounded-2xl bg-white border border-stone-200 p-5 flex flex-col gap-4 shadow-sm">
      <div className="flex flex-col">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-stone-700">next allowance</span>
          <span className="text-xs text-stone-500">
            {formatUsdc(family.streamRate)}
          </span>
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          {monthlyReady ? (
            <span className="text-2xl font-semibold text-emerald-700">
              ready now! 🎉
            </span>
          ) : (
            <>
              <span className="text-3xl font-semibold text-emerald-900 tabular-nums">
                {monthly.value}
              </span>
              <span className="text-xs text-stone-500">{monthly.label}</span>
            </>
          )}
        </div>
      </div>

      <div className="border-t border-stone-100 pt-4 flex flex-col">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-stone-700">13th allowance</span>
          <span className="text-xs text-stone-500">year-end yield bonus</span>
        </div>
        <div className="flex items-baseline gap-2 mt-1">
          {bonusReady ? (
            <span className="text-2xl font-semibold text-amber-600">
              ready now! 🎁
            </span>
          ) : (
            <>
              <span className="text-3xl font-semibold text-amber-700 tabular-nums">
                {bonus.value}
              </span>
              <span className="text-xs text-stone-500">{bonus.label}</span>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
