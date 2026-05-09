"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { DEVNET_ADDRESSES } from "@/lib/program";
import { fetchFamiliesForParent, type FamilyView } from "@/lib/fetchFamilies";
import { fetchVaultClock, type VaultClock } from "@/lib/fetchFamilyByPda";
import { useSeedlingWallet } from "@/lib/wallet";
import { AddKidForm } from "@/components/dashboard/AddKidForm";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { FamilyCard } from "@/components/dashboard/FamilyCard";
import { ParentAccountSection } from "@/components/dashboard/ParentAccountSection";
import { Plus } from "@/components/dashboard/icons";
import { DASHBOARD_STYLES } from "@/components/dashboard/styles";
import { LocaleToggle } from "@/components/LocaleToggle";
import { PrivyLoginButton } from "@/components/PrivyLoginButton";
import { useLocale, TItalic } from "@/lib/i18n";

export default function Dashboard() {
  const { connection } = useConnection();
  const { publicKey, connected } = useSeedlingWallet();
  const { t } = useLocale();

  const [families, setFamilies] = useState<FamilyView[] | null>(null);
  const [vaultClock, setVaultClock] = useState<VaultClock | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  // Bumped on every refetch so ParentAccountSection re-fetches the
  // wallet balance after a tx (deposit, top-up, withdraw) without
  // needing its own polling loop.
  const [accountRefreshKey, setAccountRefreshKey] = useState(0);

  const refetch = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const [result, clk] = await Promise.all([
        fetchFamiliesForParent(connection, publicKey),
        fetchVaultClock(connection, DEVNET_ADDRESSES.vaultConfig),
      ]);
      setFamilies(result);
      setVaultClock(clk);
      setAccountRefreshKey((k) => k + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    if (connected) refetch();
    else setFamilies(null);
  }, [connected, refetch]);

  return (
    <div className="dash-root">
      <style dangerouslySetInnerHTML={{ __html: DASHBOARD_STYLES }} />

      <nav className="dash-nav">
        <div className="dash-wrap dash-nav-inner">
          <Link href="/" className="dash-wordmark">
            seedling
            <span className="dot" />
          </Link>
          <div className="dash-row" style={{ gap: 14, alignItems: "center" }}>
            <LocaleToggle />
            <span
              className="dash-mono dash-nav-pulse"
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
              <span className="dash-nav-pulse-text">{t("nav.live.short")}</span>
            </span>
            <PrivyLoginButton variant="nav" />
          </div>
        </div>
      </nav>

      <div className="dash-wrap">
        {!connected ? (
          <ConnectGate />
        ) : (
          <>
            {/* Page-level eyebrow at the top — describes the page, not the
                kids list. The "X kid(s) saving" title sits further down,
                right above the kids list it actually describes. */}
            <div style={{ paddingTop: 56 }}>
              <span className="dash-eyebrow">
                <span className="rule" /> {t("dashboard.eyebrow")}
              </span>
            </div>

            {error && (
              <div
                className="dash-card"
                style={{
                  padding: 24,
                  marginTop: 32,
                  marginBottom: 32,
                  borderColor: "var(--rose)",
                }}
              >
                <span
                  className="dash-mono"
                  style={{ color: "var(--rose)", fontSize: 12 }}
                >
                  {t("dashboard.error.load", { error: error ?? "" })}
                </span>
              </div>
            )}

            {showAddForm && publicKey && (
              <AddKidForm
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
                  padding: "120px 0",
                  color: "var(--ink-3)",
                  fontSize: 12,
                }}
              >
                {t("dashboard.fetching")}
              </div>
            )}

            {publicKey && families != null && (
              <div style={{ paddingTop: 24 }}>
                <ParentAccountSection
                  connection={connection}
                  parent={publicKey}
                  refreshKey={accountRefreshKey}
                  onChanged={refetch}
                />
              </div>
            )}

            {/* Kids section header — title + subtitle introduce the kids
                list below. Eyebrow stays at the top of the page where it
                belongs (page-level, not kids-level). */}
            {families != null && (
              <header style={{ paddingTop: 24, paddingBottom: 40 }}>
                <div className="dash-col" style={{ gap: 14, maxWidth: 760 }}>
                  <h1
                    className="dash-serif"
                    style={{
                      fontSize: 56,
                      lineHeight: 0.95,
                      margin: 0,
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {families.length === 0 ? (
                      <TItalic
                        tplKey="dashboard.title.first"
                        italicKey="dashboard.title.first.italic"
                      />
                    ) : (
                      <KidsTitle count={families.length} />
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
                    {t("dashboard.subtitle")}
                  </span>
                </div>
              </header>
            )}

            {!loading &&
              families != null &&
              families.length === 0 &&
              !showAddForm && <EmptyState onAdd={() => setShowAddForm(true)} />}

            {families != null && families.length > 0 && publicKey && (
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
                      <Plus /> {t("dashboard.add_another")}
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
              {t("landing.footer.built")}
            </span>
          </div>
          <div className="dash-row" style={{ gap: 22 }}>
            <a
              className="dash-btn-link"
              href="https://github.com/djpowehi/seedling"
              target="_blank"
              rel="noreferrer"
            >
              {t("footer.github")} ↗
            </a>
            <a
              className="dash-btn-link"
              href="https://twitter.com/seedling_sol"
              target="_blank"
              rel="noreferrer"
            >
              {t("footer.x")} ↗
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Renders the dynamic "{count} {kid|kids} {italic}." dashboard headline.
// Splits the localized template on placeholders so the italic word can be
// wrapped in <em> while the count + plural-aware noun remain in normal weight.
function KidsTitle({ count }: { count: number }) {
  const { t } = useLocale();
  const kidWord = t(
    count === 1 ? "dashboard.title.word.kid" : "dashboard.title.word.kids"
  );
  const tmpl = t("dashboard.title.kids", {
    count,
    kidWord,
    italic: "{italic}",
  });
  const [pre, post = ""] = tmpl.split("{italic}");
  return (
    <>
      {pre}
      <span className="dash-italic">{t("dashboard.title.kids.italic")}</span>
      {post}
    </>
  );
}

function ConnectGate() {
  const { t } = useLocale();
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
          <span className="rule" /> {t("gate.eyebrow")}
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
          <TItalic tplKey="gate.title" italicKey="gate.title.italic" />
        </h1>
        <p style={{ color: "var(--ink-2)", margin: 0, maxWidth: 460 }}>
          {t("gate.body")}
        </p>
        <div style={{ marginTop: 8 }}>
          <PrivyLoginButton variant="gate" />
        </div>
      </div>
    </div>
  );
}
