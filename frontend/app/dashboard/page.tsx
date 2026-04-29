"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { DEVNET_ADDRESSES } from "@/lib/program";
import { fetchFamiliesForParent, type FamilyView } from "@/lib/fetchFamilies";
import { fetchVaultClock, type VaultClock } from "@/lib/fetchFamilyByPda";
import { useSeedlingProgram } from "@/lib/useSeedlingProgram";
import { AddKidForm } from "@/components/dashboard/AddKidForm";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { FamilyCard } from "@/components/dashboard/FamilyCard";
import { Plus } from "@/components/dashboard/icons";
import { DASHBOARD_STYLES } from "@/components/dashboard/styles";

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
  const [vaultClock, setVaultClock] = useState<VaultClock | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  const refetch = useCallback(async () => {
    if (!seedling || !publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const [result, clk] = await Promise.all([
        fetchFamiliesForParent(connection, seedling.program, publicKey),
        fetchVaultClock(connection, DEVNET_ADDRESSES.vaultConfig),
      ]);
      setFamilies(result);
      setVaultClock(clk);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [connection, seedling, publicKey]);

  useEffect(() => {
    if (connected && seedling) refetch();
    else setFamilies(null);
  }, [connected, seedling, refetch]);

  return (
    <div className="dash-root">
      <style dangerouslySetInnerHTML={{ __html: DASHBOARD_STYLES }} />

      <nav className="dash-nav">
        <div className="dash-wrap dash-nav-inner">
          <Link href="/" className="dash-wordmark">
            seedling
            <span className="dot" />
          </Link>
          <div className="dash-row" style={{ gap: 28, alignItems: "center" }}>
            <span
              className="dash-mono"
              style={{
                fontSize: 11,
                color: "var(--ink-2)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span className="dash-pulse-dot" />
              live on Solana
            </span>
            <WalletMultiButton />
          </div>
        </div>
      </nav>

      <div className="dash-wrap">
        {!connected ? (
          <ConnectGate />
        ) : (
          <>
            <header style={{ paddingTop: 80, paddingBottom: 56 }}>
              <div className="dash-col" style={{ gap: 18, maxWidth: 760 }}>
                <span className="dash-eyebrow">
                  <span className="rule" /> your families
                </span>
                <h1
                  className="dash-serif"
                  style={{
                    fontSize: 88,
                    lineHeight: 0.95,
                    margin: 0,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {families == null ? (
                    <>loading…</>
                  ) : families.length === 0 ? (
                    <>
                      start the <span className="dash-italic">first</span>.
                    </>
                  ) : (
                    <>
                      {families.length} {families.length === 1 ? "kid" : "kids"}{" "}
                      <span className="dash-italic">saving</span>.
                    </>
                  )}
                </h1>
                <span
                  className="dash-mono"
                  style={{
                    fontSize: 13,
                    color: "var(--ink-3)",
                    letterSpacing: "0.04em",
                  }}
                >
                  all live on Solana
                </span>
              </div>
            </header>

            {error && (
              <div
                className="dash-card"
                style={{
                  padding: 24,
                  marginBottom: 32,
                  borderColor: "var(--rose)",
                }}
              >
                <span
                  className="dash-mono"
                  style={{ color: "var(--rose)", fontSize: 12 }}
                >
                  Couldn&apos;t load families. {error}
                </span>
              </div>
            )}

            {showAddForm && seedling && publicKey && (
              <AddKidForm
                program={seedling.program}
                connection={connection}
                parent={publicKey}
                onCancel={() => setShowAddForm(false)}
                onCreated={() => {
                  setShowAddForm(false);
                  refetch();
                }}
              />
            )}

            {loading && families == null && (
              <div
                className="dash-mono"
                style={{
                  textAlign: "center",
                  padding: "40px 0",
                  color: "var(--ink-3)",
                  fontSize: 12,
                }}
              >
                Fetching from devnet…
              </div>
            )}

            {!loading &&
              families != null &&
              families.length === 0 &&
              !showAddForm && <EmptyState onAdd={() => setShowAddForm(true)} />}

            {families != null &&
              families.length > 0 &&
              seedling &&
              publicKey && (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(min(100%, 520px), 1fr))",
                      gap: 36,
                    }}
                  >
                    {families.map((family) => (
                      <FamilyCard
                        key={family.pubkey.toBase58()}
                        family={family}
                        program={seedling.program}
                        connection={connection}
                        parent={publicKey}
                        vaultClock={vaultClock}
                        onMutated={refetch}
                      />
                    ))}
                  </div>
                  {!showAddForm && (
                    <div
                      className="dash-row"
                      style={{
                        justifyContent: "center",
                        marginTop: 56,
                      }}
                    >
                      <button
                        className="dash-btn dash-btn-ghost"
                        onClick={() => setShowAddForm(true)}
                        style={{ padding: "14px 22px" }}
                      >
                        <Plus /> add another kid
                      </button>
                    </div>
                  )}
                </>
              )}
          </>
        )}
      </div>

      <footer className="dash-footer">
        <div className="dash-wrap dash-footer-inner">
          <div className="dash-row" style={{ gap: 18, alignItems: "baseline" }}>
            <span className="dash-serif" style={{ fontSize: 22 }}>
              seedling.
            </span>
            <span
              className="dash-mono"
              style={{ fontSize: 11, color: "var(--ink-3)" }}
            >
              Built on Kamino · Solana
            </span>
          </div>
          <div className="dash-row" style={{ gap: 22 }}>
            <a
              className="dash-btn-link"
              href="https://github.com/djpowehi/seedling"
              target="_blank"
              rel="noreferrer"
            >
              github ↗
            </a>
            <a
              className="dash-btn-link"
              href="https://twitter.com/seedling_sol"
              target="_blank"
              rel="noreferrer"
            >
              @seedling_sol ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ConnectGate() {
  return (
    <div style={{ paddingTop: 120, paddingBottom: 120 }}>
      <div
        className="dash-col"
        style={{
          maxWidth: 560,
          margin: "0 auto",
          gap: 24,
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <span className="dash-eyebrow">
          <span className="rule" /> sign in
        </span>
        <h1
          className="dash-serif"
          style={{
            fontSize: 68,
            lineHeight: 1,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          connect to see <span className="dash-italic">your families</span>.
        </h1>
        <p style={{ color: "var(--ink-2)", margin: 0, maxWidth: 460 }}>
          Seedling lives on Solana. Connect Phantom or Solflare to view your
          kids&apos; positions, deposit USDC, and trigger distributions.
        </p>
      </div>
    </div>
  );
}
