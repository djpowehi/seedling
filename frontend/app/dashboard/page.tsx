"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AddKidForm } from "@/components/AddKidForm";
import { FamilyCard } from "@/components/FamilyCard";
import { fetchFamiliesForParent, type FamilyView } from "@/lib/fetchFamilies";
import { useSeedlingProgram } from "@/lib/useSeedlingProgram";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

export default function Dashboard() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const seedling = useSeedlingProgram();

  const [families, setFamilies] = useState<FamilyView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const refetch = useCallback(async () => {
    if (!seedling || !publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFamiliesForParent(
        connection,
        seedling.program,
        publicKey
      );
      setFamilies(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [connection, seedling, publicKey]);

  useEffect(() => {
    if (connected && seedling) refetch();
    else setFamilies(null);
  }, [connected, seedling, refetch]);

  if (!connected) {
    return (
      <main className="flex flex-1 w-full flex-col items-center justify-center px-6 py-24">
        <section className="w-full max-w-xl flex flex-col items-center text-center gap-8">
          <Link href="/" className="text-emerald-900 hover:underline text-sm">
            ← back
          </Link>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-emerald-900">
            connect to see your families
          </h1>
          <p className="text-stone-600">
            Seedling lives on Solana devnet. Connect Phantom or Solflare to view
            your kids&apos; positions, deposit USDC, and trigger distributions.
          </p>
          <WalletMultiButton />
        </section>
      </main>
    );
  }

  return (
    <main className="flex flex-1 w-full flex-col items-center px-6 py-12">
      <div className="w-full max-w-3xl flex flex-col gap-8">
        <header className="flex items-center justify-between">
          <Link href="/" className="text-emerald-900 hover:underline text-sm">
            ← seedling
          </Link>
          <WalletMultiButton />
        </header>

        <section className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-emerald-900">
            your families
          </h1>
          <p className="text-sm text-stone-600">
            {families == null
              ? "Loading…"
              : `${families.length} ${
                  families.length === 1 ? "family" : "families"
                } on devnet`}
          </p>
        </section>

        {loading && (
          <div className="text-stone-500 text-sm">Fetching from devnet…</div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <strong>Couldn&apos;t fetch families.</strong> {error}
          </div>
        )}

        {showForm && seedling && publicKey && (
          <AddKidForm
            program={seedling.program}
            connection={connection}
            parent={publicKey}
            onCancel={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false);
              refetch();
            }}
          />
        )}

        {!loading &&
          !error &&
          !showForm &&
          families != null &&
          families.length === 0 && (
            <div className="rounded-2xl border-2 border-dashed border-stone-300 p-12 flex flex-col items-center text-center gap-4">
              <span className="text-4xl">🌱</span>
              <h2 className="text-xl font-medium text-emerald-900">
                No kids yet
              </h2>
              <p className="text-sm text-stone-600 max-w-sm">
                Add your first kid to start their allowance. They&apos;ll need a
                Solana wallet address — you can use Phantom to generate one for
                them.
              </p>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="mt-2 rounded-full bg-lime-600 px-5 py-2 text-sm font-medium text-white hover:bg-lime-700"
              >
                Add your first kid
              </button>
            </div>
          )}

        {!loading &&
          families != null &&
          families.length > 0 &&
          seedling &&
          publicKey && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {families.map((f) => (
                  <FamilyCard
                    key={f.pubkey.toBase58()}
                    family={f}
                    program={seedling.program}
                    connection={connection}
                    parent={publicKey}
                    onMutated={refetch}
                  />
                ))}
              </div>
              {!showForm && (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowForm(true)}
                    className="rounded-full border border-emerald-700 text-emerald-900 px-5 py-2 text-sm font-medium hover:bg-emerald-50"
                  >
                    + add another kid
                  </button>
                </div>
              )}
            </>
          )}
      </div>
    </main>
  );
}
