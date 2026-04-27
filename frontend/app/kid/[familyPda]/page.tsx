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
import { KidView } from "@/components/KidView";

type PageProps = {
  params: Promise<{ familyPda: string }>;
};

export default function KidViewPage({ params }: PageProps) {
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

  if (error || !family || !clock) {
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

  return (
    <KidView
      family={family}
      initialClock={{
        totalShares: clock.totalShares,
        lastKnownTotalAssets: clock.lastKnownTotalAssets,
        periodEndTs: clock.periodEndTs,
      }}
      kidName={name}
    />
  );
}
