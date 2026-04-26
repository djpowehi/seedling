"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { BN } from "@coral-xyz/anchor";
import { getSavingsGoal, type SavingsGoal } from "@/lib/savingsGoals";

type Props = {
  familyPubkey: string;
  // Combined balance = principal_remaining + total_yield_earned, in USDC base units.
  combinedBalance: BN;
};

export function SavingsGoalDisplay({ familyPubkey, combinedBalance }: Props) {
  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [imgOk, setImgOk] = useState(true);
  useEffect(() => {
    setGoal(getSavingsGoal(familyPubkey));
  }, [familyPubkey]);

  if (!goal) {
    return (
      <section className="rounded-2xl bg-stone-50 border border-stone-200 p-5 flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wider text-stone-500">
          saving for
        </span>
        <span className="text-sm text-stone-500 italic">
          ask your parent to set a goal
        </span>
      </section>
    );
  }

  const balanceUsd = Number(combinedBalance.toString()) / 1_000_000;
  const pct = Math.min(100, (balanceUsd / goal.amountUsd) * 100);
  const reached = pct >= 100;

  return (
    <section className="rounded-2xl bg-amber-50/60 border border-amber-200 p-5 flex flex-col gap-3 shadow-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-amber-900">
          saving for
        </span>
        <span className="text-xs text-stone-500 tabular-nums">
          ${balanceUsd.toFixed(2)} of ${goal.amountUsd.toLocaleString()}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {goal.photoUrl && imgOk ? (
          <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-white border border-amber-100 shrink-0">
            <Image
              src={goal.photoUrl}
              alt={goal.label}
              fill
              sizes="64px"
              className="object-cover"
              onError={() => setImgOk(false)}
              unoptimized
            />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-xl bg-amber-100 border border-amber-200 shrink-0 flex items-center justify-center text-2xl">
            🎯
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-base font-medium text-emerald-900 truncate">
            {goal.label}
          </div>
          <div className="mt-2 h-2 rounded-full bg-stone-200 overflow-hidden">
            <div
              className={`h-full ${
                reached ? "bg-emerald-500" : "bg-amber-500"
              } transition-all duration-500`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-stone-600 tabular-nums">
            {reached ? "you did it! 🎉" : `${pct.toFixed(1)}%`}
          </div>
        </div>
      </div>
    </section>
  );
}
