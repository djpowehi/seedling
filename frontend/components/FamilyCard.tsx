"use client";

import { formatUsdc, relativeTime, shortPubkey } from "@/lib/format";
import type { FamilyView } from "@/lib/fetchFamilies";

export function FamilyCard({ family }: { family: FamilyView }) {
  const nextEligible = Number(family.lastDistribution.toString()) + 30 * 86400;

  return (
    <article className="rounded-2xl bg-white border border-stone-200 p-6 flex flex-col gap-4 shadow-sm">
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-stone-500">
            kid
          </span>
          <code className="text-sm text-emerald-900 font-mono">
            {shortPubkey(family.kid)}
          </code>
        </div>
        <span className="text-xs text-stone-500">
          created {relativeTime(family.createdAt)}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-stone-500">
            stream
          </span>
          <span className="text-emerald-900 font-medium">
            {formatUsdc(family.streamRate)}/mo
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-stone-500">
            principal
          </span>
          <span className="text-emerald-900 font-medium">
            {formatUsdc(family.principalRemaining)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-stone-500">
            shares
          </span>
          <span className="text-emerald-900 font-medium">
            {family.shares.toString()}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-wider text-stone-500">
            yield earned
          </span>
          <span className="text-emerald-900 font-medium">
            {formatUsdc(family.totalYieldEarned)}
          </span>
        </div>
      </div>

      <footer className="border-t border-stone-100 pt-3 flex items-center justify-between text-xs text-stone-500">
        <span>last paid {relativeTime(family.lastDistribution)}</span>
        <span className="text-lime-700">
          next eligible {relativeTime(nextEligible)}
        </span>
      </footer>
    </article>
  );
}
