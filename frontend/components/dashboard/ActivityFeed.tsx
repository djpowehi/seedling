"use client";

// Recent on-chain activity for a single family — the dashboard's "memory."
// Renders the last few events (creation, deposits, gifts, withdrawals,
// distributions) as compact rows with icon + label + amount + time.
//
// Refetches every 30s while mounted. Initial fetch on mount. Click any
// row → opens the tx on Solscan in a new tab.

import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { MAINNET_RPC } from "@/lib/program";
import {
  fetchFamilyActivity,
  type ActivityEntry,
  type ActivityKind,
} from "@/lib/fetchFamilyActivity";
import { useLocale } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";

type Props = {
  familyPda: PublicKey;
};

const POLL_MS = 30_000;
// How many rows to show by default. The expand button reveals the rest.
const VISIBLE_DEFAULT = 4;

export function ActivityFeed({ familyPda }: Props) {
  const { t } = useLocale();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    const connection = new Connection(MAINNET_RPC, "confirmed");
    try {
      const next = await fetchFamilyActivity(connection, familyPda);
      setEntries(next);
    } catch {
      // Silent retry on next poll — RPC blips are common.
    } finally {
      setLoading(false);
    }
  }, [familyPda]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (loading && entries.length === 0) {
    return null; // Suppress flicker on first paint — empty state below covers no-activity.
  }

  if (entries.length === 0) return null;

  const visible = expanded ? entries : entries.slice(0, VISIBLE_DEFAULT);

  return (
    <div style={{ marginTop: 24 }}>
      <div
        className="dash-mono"
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          marginBottom: 10,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <span>{t("card.activity.eyebrow")}</span>
        <span style={{ color: "var(--ink-2)" }}>
          {t("card.activity.count", { n: entries.length })}
        </span>
      </div>
      <div className="dash-col" style={{ gap: 6 }}>
        {visible.map((e) => (
          <ActivityRow key={e.sig} entry={e} />
        ))}
      </div>
      {entries.length > VISIBLE_DEFAULT && (
        <button
          type="button"
          className="dash-btn-link"
          style={{
            marginTop: 8,
            fontSize: 11,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? t("card.activity.collapse")
            : t("card.activity.expand", {
                n: entries.length - VISIBLE_DEFAULT,
              })}
        </button>
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const { t } = useLocale();
  const { icon, label, sign } = kindMeta(entry, t);
  const amountStr =
    entry.amountUsd > 0
      ? `${sign}$${entry.amountUsd.toFixed(entry.amountUsd < 0.01 ? 4 : 2)}`
      : "";
  return (
    <a
      href={`https://solscan.io/tx/${entry.sig}`}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--line-soft, #e9e3d5)",
        textDecoration: "none",
        color: "inherit",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(0,0,0,0.02)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>
        {icon}
      </span>
      <div className="dash-col" style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <span style={{ fontSize: 13, color: "var(--ink, #1f2920)" }}>
          {label}
        </span>
        <span
          className="dash-mono"
          style={{ fontSize: 10, color: "var(--ink-3)" }}
        >
          {timeAgo(entry.ts, t)}
        </span>
      </div>
      {amountStr && (
        <span
          className="dash-mono"
          style={{
            fontSize: 13,
            color: sign === "+" ? "var(--forest, #2e5b3f)" : "var(--ink)",
            whiteSpace: "nowrap",
          }}
        >
          {amountStr}
        </span>
      )}
    </a>
  );
}

function kindMeta(
  e: ActivityEntry,
  t: (k: TranslationKey, vars?: Record<string, string | number>) => string
): { icon: string; label: string; sign: "+" | "−" | "" } {
  switch (e.kind) {
    case "created":
      return {
        icon: "🌱",
        label: t("card.activity.row.created"),
        sign: "",
      };
    case "deposit":
      return {
        icon: "↓",
        label: t("card.activity.row.deposit"),
        sign: "+",
      };
    case "gift":
      return {
        icon: "🎁",
        label: e.fromName
          ? t("card.activity.row.gift_from", { name: e.fromName })
          : t("card.activity.row.gift"),
        sign: "+",
      };
    case "withdraw":
      return {
        icon: "↑",
        label: t("card.activity.row.withdraw"),
        sign: "−",
      };
    case "monthly":
      return {
        icon: "📅",
        label: t("card.activity.row.monthly"),
        sign: "−",
      };
    case "bonus":
      return {
        icon: "✨",
        label: t("card.activity.row.bonus"),
        sign: "−",
      };
    case "closed":
      return {
        icon: "✕",
        label: t("card.activity.row.closed"),
        sign: "−",
      };
  }
}

function timeAgo(
  tsSec: number,
  t: (k: TranslationKey, vars?: Record<string, string | number>) => string
): string {
  const elapsed = Math.floor(Date.now() / 1000 - tsSec);
  if (elapsed < 60) return t("card.activity.just_now");
  if (elapsed < 3600)
    return t("card.activity.minutes_ago", { n: Math.floor(elapsed / 60) });
  if (elapsed < 86400)
    return t("card.activity.hours_ago", { n: Math.floor(elapsed / 3600) });
  return t("card.activity.days_ago", { n: Math.floor(elapsed / 86400) });
}
