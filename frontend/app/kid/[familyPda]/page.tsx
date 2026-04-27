"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { DEVNET_ADDRESSES, DEVNET_RPC } from "@/lib/program";
import {
  fetchFamilyByPda,
  fetchVaultClock,
  type VaultClock,
} from "@/lib/fetchFamilyByPda";
import type { FamilyView } from "@/lib/fetchFamilies";
import { getKidName } from "@/lib/kidNames";
import { formatUsdc } from "@/lib/format";
import { Countdowns } from "@/components/Countdowns";
import { SavingsGoals } from "@/components/SavingsGoals";
import { YieldTicker } from "@/components/YieldTicker";

type PageProps = {
  params: Promise<{ familyPda: string }>;
};

export default function KidViewPage({ params }: PageProps) {
  const [familyPda, setFamilyPda] = useState<PublicKey | null>(null);
  const [family, setFamily] = useState<FamilyView | null>(null);
  const [clock, setClock] = useState<VaultClock | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { familyPda: pdaStr } = await params;
        const pda = new PublicKey(pdaStr);
        if (cancelled) return;
        setFamilyPda(pda);

        const connection = new Connection(DEVNET_RPC, "confirmed");
        const [fam, clk] = await Promise.all([
          fetchFamilyByPda(connection, pda),
          fetchVaultClock(connection, DEVNET_ADDRESSES.vaultConfig),
        ]);
        if (cancelled) return;
        if (!fam) {
          setError("We couldn't find this kid's allowance. Check the link?");
          setLoading(false);
          return;
        }
        setFamily(fam);
        setClock(clk);
        setName(getKidName(pda.toBase58()));
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : "Something went wrong loading this page."
        );
        setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [params]);

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="text-stone-500 text-sm">Loading…</div>
      </main>
    );
  }

  if (error || !family) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="max-w-md text-center flex flex-col gap-4">
          <span className="text-4xl">🌱</span>
          <h1 className="text-xl font-medium text-emerald-900">
            {error ?? "Not found"}
          </h1>
          <Link href="/" className="text-sm text-emerald-900 hover:underline">
            ← seedling
          </Link>
        </div>
      </main>
    );
  }

  const greetingName = name ?? "friend";
  const principal = family.principalRemaining;
  const yieldEarned = family.totalYieldEarned;

  return (
    <main className="flex flex-1 w-full flex-col items-center px-6 py-12 bg-gradient-to-b from-emerald-50/40 to-stone-50">
      <div className="w-full max-w-md flex flex-col gap-8">
        <header className="flex flex-col items-center text-center gap-2">
          <span className="text-xs uppercase tracking-widest text-stone-500">
            hi
          </span>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-emerald-900">
            {greetingName}
          </h1>
        </header>

        {/* TREE PLACEHOLDER — Day 11 #1 fills this with the growing-tree SVG */}
        <div className="aspect-square rounded-3xl bg-white border border-emerald-100 shadow-sm flex items-center justify-center">
          <span className="text-7xl">🌱</span>
        </div>

        {clock && (
          <YieldTicker
            family={family}
            initialClock={{
              totalShares: clock.totalShares,
              lastKnownTotalAssets: clock.lastKnownTotalAssets,
            }}
          />
        )}

        <div className="grid grid-cols-2 gap-3">
          <section className="rounded-2xl bg-white border border-stone-200 p-4 flex flex-col gap-1 shadow-sm">
            <span className="text-xs uppercase tracking-wider text-stone-500">
              your savings
            </span>
            <span className="text-xl font-medium text-emerald-900 tabular-nums">
              {formatUsdc(principal)}
            </span>
          </section>
          <section className="rounded-2xl bg-white border border-stone-200 p-4 flex flex-col gap-1 shadow-sm">
            <span className="text-xs uppercase tracking-wider text-stone-500">
              earned in yield
            </span>
            <span className="text-xl font-medium text-lime-700 tabular-nums">
              {formatUsdc(yieldEarned)}
            </span>
          </section>
        </div>

        {clock && <Countdowns family={family} clock={clock} />}

        <SavingsGoals
          familyPubkey={family.pubkey.toBase58()}
          combinedBalance={family.principalRemaining.add(
            family.totalYieldEarned
          )}
        />

        <footer className="text-center text-xs text-stone-400 pt-4">
          powered by{" "}
          <Link href="/" className="hover:text-stone-600 underline">
            seedling
          </Link>{" "}
          on Solana devnet
        </footer>
      </div>
    </main>
  );
}
