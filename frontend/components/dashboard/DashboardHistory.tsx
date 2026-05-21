"use client";

// HISTORY section — the third tier of the dashboard, sitting below the
// kid cards. Aggregates on-chain activity across every family the parent
// has created, sorted by time, with each row tagged by kid name.
//
// One vault per parent, multiple families possible. The kid cards above
// answer "manage each kid's vault." This section answers "what has been
// happening across all of them."

import { useCallback, useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import { MAINNET_RPC } from "@/lib/program";
import {
  fetchFamilyActivity,
  type ActivityEntry,
} from "@/lib/fetchFamilyActivity";
import { getKidName } from "@/lib/kidNames";
import { useLocale } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";
import type { FamilyView } from "@/lib/fetchFamilies";

type HistoryEntry = ActivityEntry & {
  familyKey: string;
};

type Props = {
  families: FamilyView[];
};

const POLL_MS = 30_000;
const VISIBLE_DEFAULT = 6;

export function DashboardHistory({ families }: Props) {
  const { t, locale } = useLocale();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const familyKeys = families.map((f) => f.pubkey.toBase58()).join(",");

  const load = useCallback(async () => {
    if (families.length === 0) {
      setLoading(false);
      return;
    }
    const connection = new Connection(MAINNET_RPC, "confirmed");
    try {
      // Fan-out fetch across all families in parallel — module-level cache
      // inside fetchFamilyActivity keeps re-fetches cheap.
      const perFamily = await Promise.all(
        families.map(async (f) => {
          const items = await fetchFamilyActivity(connection, f.pubkey);
          return items.map<HistoryEntry>((item) => ({
            ...item,
            familyKey: f.pubkey.toBase58(),
          }));
        })
      );
      const merged = perFamily.flat().sort((a, b) => b.ts - a.ts);
      setEntries(merged);
    } catch {
      // Silent retry on next poll.
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyKeys, families.length]);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  if (loading && entries.length === 0) return null;
  if (entries.length === 0) return null;

  const visible = expanded ? entries : entries.slice(0, VISIBLE_DEFAULT);

  return (
    <section style={{ marginTop: 72 }}>
      <header style={{ paddingBottom: 24 }}>
        <span className="dash-eyebrow">
          <span className="rule" /> {t("history.eyebrow")}
        </span>
        <h2
          className="dash-serif"
          style={{
            fontSize: 40,
            lineHeight: 1,
            margin: "14px 0 0",
            letterSpacing: "-0.02em",
          }}
        >
          {t("history.title")}
        </h2>
        <span
          className="dash-mono"
          style={{
            fontSize: 13,
            color: "var(--ink-3)",
            letterSpacing: "0.04em",
            marginTop: 10,
            display: "block",
          }}
        >
          {entries.length === 1
            ? t("history.subtitle.one")
            : t("history.subtitle.other", { n: entries.length })}
        </span>
      </header>

      <div className="dash-card" style={{ padding: 28 }}>
        <div className="dash-col" style={{ gap: 0 }}>
          {visible.map((e) => (
            <HistoryRow key={`${e.familyKey}:${e.sig}:${e.kind}`} entry={e} />
          ))}
        </div>
        {entries.length > VISIBLE_DEFAULT && (
          <button
            type="button"
            className="dash-btn-link"
            style={{
              marginTop: 16,
              fontSize: 11,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--ink-3)",
            }}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? t("history.collapse")
              : t("history.expand", {
                  n: entries.length - VISIBLE_DEFAULT,
                })}
          </button>
        )}
      </div>
    </section>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const { t, locale } = useLocale();
  const { icon, label, sign } = kindMeta(entry, t);
  const kidName = getKidName(entry.familyKey) ?? t("card.unnamed");
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
        gap: 16,
        padding: "12px 0",
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
      <span style={{ fontSize: 18, width: 24, textAlign: "center" }}>
        {icon}
      </span>
      <div className="dash-col" style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <span
          style={{
            fontSize: 14,
            color: "var(--ink, #1f2920)",
          }}
        >
          {label} <span style={{ color: "var(--ink-2)" }}>· {kidName}</span>
        </span>
        <span
          className="dash-mono"
          style={{ fontSize: 11, color: "var(--ink-3)" }}
        >
          {formatEventTime(entry.ts, locale, t)}
        </span>
      </div>
      {amountStr && (
        <span
          className="dash-mono"
          style={{
            fontSize: 14,
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
      return { icon: "🌱", label: t("card.activity.row.created"), sign: "" };
    case "deposit":
      return { icon: "↓", label: t("card.activity.row.deposit"), sign: "+" };
    case "gift":
      return {
        icon: "🎁",
        label: e.fromName
          ? t("card.activity.row.gift_from", { name: e.fromName })
          : t("card.activity.row.gift"),
        sign: "+",
      };
    case "withdraw":
      return { icon: "↑", label: t("card.activity.row.withdraw"), sign: "−" };
    case "monthly":
      return { icon: "📅", label: t("card.activity.row.monthly"), sign: "−" };
    case "bonus":
      return { icon: "✨", label: t("card.activity.row.bonus"), sign: "−" };
    case "closed":
      return { icon: "✕", label: t("card.activity.row.closed"), sign: "−" };
  }
}

// Recent events read better in relative time ("12m ago"); anything 24h+
// switches to a date. Locale-aware: en → MM/DD, pt-BR → DD/MM via
// Intl.DateTimeFormat — handles the ordering convention automatically.
function formatEventTime(
  tsSec: number,
  locale: "en" | "pt-BR",
  t: (k: TranslationKey, vars?: Record<string, string | number>) => string
): string {
  const elapsed = Math.floor(Date.now() / 1000 - tsSec);
  if (elapsed < 60) return t("card.activity.just_now");
  if (elapsed < 3600)
    return t("card.activity.minutes_ago", { n: Math.floor(elapsed / 60) });
  if (elapsed < 86400)
    return t("card.activity.hours_ago", { n: Math.floor(elapsed / 3600) });
  return new Intl.DateTimeFormat(locale, {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(tsSec * 1000));
}
