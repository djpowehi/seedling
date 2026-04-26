"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Connection, PublicKey } from "@solana/web3.js";
import type { Program } from "@coral-xyz/anchor";
import { DepositForm } from "@/components/DepositForm";
import { DistributeButtons } from "@/components/DistributeButtons";
import { SavingsGoalEditor } from "@/components/SavingsGoalEditor";
import { WithdrawForm } from "@/components/WithdrawForm";
import { formatUsdc, relativeTime, shortPubkey } from "@/lib/format";
import { getKidName, setKidName } from "@/lib/kidNames";
import type { FamilyView } from "@/lib/fetchFamilies";
import type { Seedling } from "@/lib/types";

type Props = {
  family: FamilyView;
  program: Program<Seedling>;
  connection: Connection;
  parent: PublicKey;
  onMutated: () => void;
};

export function FamilyCard({
  family,
  program,
  connection,
  parent,
  onMutated,
}: Props) {
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const familyKey = family.pubkey.toBase58();
  // localStorage is browser-only; useEffect avoids SSR/hydration mismatch.
  const [name, setName] = useState<string | null>(null);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => {
    setName(getKidName(familyKey));
  }, [familyKey]);

  const commitName = (next: string) => {
    setKidName(familyKey, next);
    setName(next.trim() || null);
    setEditingName(false);
  };

  const nextEligible = Number(family.lastDistribution.toString()) + 30 * 86400;

  return (
    <article className="rounded-2xl bg-white border border-stone-200 p-6 flex flex-col gap-4 shadow-sm">
      <header className="flex items-baseline justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <span className="text-xs uppercase tracking-wider text-stone-500">
            kid
          </span>
          {editingName ? (
            <input
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => commitName(nameDraft)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitName(nameDraft);
                if (e.key === "Escape") setEditingName(false);
              }}
              maxLength={40}
              autoFocus
              className="text-base font-medium text-emerald-900 bg-transparent border-b border-emerald-300 focus:outline-none focus:border-emerald-600"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setNameDraft(name ?? "");
                setEditingName(true);
              }}
              className="flex items-baseline gap-2 group text-left"
              title="Click to rename"
            >
              {name ? (
                <span className="text-base font-medium text-emerald-900">
                  {name}
                </span>
              ) : (
                <span className="text-base font-medium text-stone-400 italic">
                  add a name
                </span>
              )}
              <span className="text-xs text-stone-400 opacity-0 group-hover:opacity-100">
                ✎
              </span>
            </button>
          )}
          <code className="text-xs text-stone-500 font-mono">
            {shortPubkey(family.kid)}
          </code>
        </div>
        <span className="text-xs text-stone-500 shrink-0">
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
        <Link
          href={`/kid/${familyKey}`}
          className="text-emerald-700 hover:text-emerald-900 hover:underline"
          target="_blank"
        >
          kid&apos;s page ↗
        </Link>
      </footer>

      {!showDeposit && !showWithdraw && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 self-start flex-wrap">
            <button
              type="button"
              onClick={() => setShowDeposit(true)}
              className="rounded-full border border-emerald-700 text-emerald-900 px-4 py-1.5 text-sm font-medium hover:bg-emerald-50"
            >
              + deposit
            </button>
            <button
              type="button"
              onClick={() => setShowWithdraw(true)}
              disabled={family.shares.isZero()}
              className="rounded-full border border-stone-400 text-stone-700 px-4 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              withdraw
            </button>
          </div>
          <DistributeButtons
            program={program}
            connection={connection}
            parent={parent}
            family={family}
            onDistributed={onMutated}
          />
          <SavingsGoalEditor familyPubkey={familyKey} />
        </div>
      )}

      {showDeposit && (
        <DepositForm
          program={program}
          connection={connection}
          parent={parent}
          family={family}
          onCancel={() => setShowDeposit(false)}
          onDeposited={() => {
            setShowDeposit(false);
            onMutated();
          }}
        />
      )}

      {showWithdraw && (
        <WithdrawForm
          program={program}
          connection={connection}
          parent={parent}
          family={family}
          onCancel={() => setShowWithdraw(false)}
          onWithdrawn={() => {
            setShowWithdraw(false);
            onMutated();
          }}
        />
      )}
    </article>
  );
}
