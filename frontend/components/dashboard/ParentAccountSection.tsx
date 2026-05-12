"use client";

// Parent's Seedling account section — sits at the top of the dashboard
// above the kids list. Shows the parent's USDC balance + the two
// top-up methods (Pix on-ramp, external USDC).
//
// Why this exists at this level (vs. per-kid card): top-up actions
// fund the parent's wallet, which is shared across all kids. Putting
// the buttons on every FamilyCard duplicated them and implied a
// per-kid funding pool that doesn't exist. The two-layer mental model
// — "fund my account → deposit to kid" — matches every consumer
// fintech app (Nubank, Wise, Mercado Pago).

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  AccountLayout,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { DEVNET_ADDRESSES } from "@/lib/program";
import { useLocale } from "@/lib/i18n";
import { PixDepositForm } from "@/components/PixDepositForm";
import { TopUpAccountModal } from "@/components/TopUpAccountModal";
import { PixLogo, MoonPayLogo } from "./icons";

type Props = {
  connection: Connection;
  parent: PublicKey;
  /** Bumped by the dashboard when a tx confirms (deposit, top-up, etc.)
   *  so this section re-fetches the USDC balance. Avoids stale numbers
   *  after a successful action without polling on a timer. */
  refreshKey: number;
  /** Called when an action inside this section (Pix top-up confirm)
   *  changes state the dashboard cares about. The dashboard's refetch
   *  bumps refreshKey, which re-fetches our balance. */
  onChanged: () => void;
};

function fmtUSD(n: number): string {
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function ParentAccountSection({
  connection,
  parent,
  refreshKey,
  onChanged,
}: Props) {
  const { t, locale } = useLocale();
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);
  const [showPix, setShowPix] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);

  // Fetch parent's USDC balance. Re-fetches on:
  //   - props.refreshKey bump (parent dashboard refetch)
  //   - localRefreshKey bump (manual "refresh" button)
  // Uses getAccountInfo + AccountLayout decode so we don't need an
  // Anchor provider — wallet-free lookup.
  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    (async () => {
      try {
        const usdcAta = getAssociatedTokenAddressSync(
          DEVNET_ADDRESSES.usdcMint,
          parent
        );
        const info = await connection.getAccountInfo(usdcAta, "confirmed");
        if (cancelled) return;
        if (!info) {
          setBalanceUsd(0);
          return;
        }
        const decoded = AccountLayout.decode(info.data);
        const baseUnits = Number(decoded.amount);
        setBalanceUsd(baseUnits / 1_000_000);
      } catch {
        if (!cancelled) setBalanceUsd(0);
      } finally {
        if (!cancelled) setRefreshing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection, parent, refreshKey, localRefreshKey]);

  return (
    <section
      className="dash-card"
      style={{
        padding: "28px 32px 24px",
        marginBottom: 32,
      }}
    >
      <div
        className="dash-row"
        style={{
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        <div className="dash-col" style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div
            className="dash-mono"
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            {t("account.eyebrow")}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h2
              className="dash-serif"
              style={{
                fontSize: 38,
                lineHeight: 1,
                margin: 0,
                color: "var(--ink)",
                letterSpacing: "-0.01em",
              }}
            >
              {balanceUsd === null ? "—" : fmtUSD(balanceUsd)}
            </h2>
            {/* Manual refresh — useful right after a Pix payment lands
                if the polling/webhook timing didn't auto-update the
                cached balance yet. Cheap to expose; one RPC call. */}
            <button
              type="button"
              onClick={() => setLocalRefreshKey((k) => k + 1)}
              disabled={refreshing}
              aria-label={t("account.refresh")}
              title={t("account.refresh")}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--ink-3)",
                fontSize: 14,
                cursor: refreshing ? "default" : "pointer",
                padding: "2px 6px",
                opacity: refreshing ? 0.4 : 0.7,
                transition: "opacity 200ms",
              }}
            >
              ↻
            </button>
          </div>
          <div
            className="dash-mono"
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              marginTop: 6,
            }}
          >
            usdc · {t("account.balance_sub")}
          </div>
        </div>
      </div>

      <div className="dash-btn-row">
        <button
          className="dash-btn dash-btn-ghost"
          disabled
          aria-label="Pix top-up coming soon"
          title="Pix integration coming soon"
        >
          {locale === "pt-BR" ? <PixLogo /> : <MoonPayLogo />}{" "}
          {t("card.pay_pix")}
          <span
            style={{
              marginLeft: 8,
              padding: "2px 8px",
              fontSize: 11,
              fontFamily: "var(--font-jetbrains-mono), monospace",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              border: "1px dashed #c5613a",
              borderRadius: 4,
              color: "#c5613a",
            }}
          >
            {t("card.soon")}
          </span>
        </button>
        <button
          className="dash-btn dash-btn-ghost"
          onClick={() => setShowTopUp(true)}
        >
          <span aria-hidden="true">↻</span> {t("card.top_up")}
        </button>
      </div>

      {showPix && (
        <div style={{ marginTop: 16 }}>
          <PixDepositForm
            parent={parent}
            onCancel={() => setShowPix(false)}
            onCredited={() => {
              setShowPix(false);
              onChanged();
            }}
          />
        </div>
      )}

      {showTopUp && (
        <TopUpAccountModal
          walletPubkey={parent}
          onClose={() => setShowTopUp(false)}
        />
      )}
    </section>
  );
}
