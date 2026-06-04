// Kid-facing log of past allowance distributions. Mirrors the gift wall
// pattern but filtered to monthly + bonus payouts only — the kid's own
// money story, not gifts from others. Wallet-free (uses the public RPC
// through fetchFamilyActivity which only reads program-event logs).
//
// Bonus entries get a gold accent because the year-end décimo terceiro
// is a moment, not another row. Empty state anchors the kid on the next
// upcoming payout date so the section never feels empty-empty.
"use client";

import { useEffect, useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";

import { MAINNET_RPC } from "@/lib/program";
import {
  fetchFamilyActivity,
  type ActivityEntry,
} from "@/lib/fetchFamilyActivity";
import { useLocale } from "@/lib/i18n";

interface KidPayoutLogProps {
  familyPda: PublicKey;
  /** Unix-seconds timestamp of the next allowance eligibility — used for the
   *  empty-state copy when no payouts have fired yet. */
  nextAllowanceAt: number;
}

export function KidPayoutLog({
  familyPda,
  nextAllowanceAt,
}: KidPayoutLogProps) {
  const { t, locale } = useLocale();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const conn = new Connection(MAINNET_RPC, "confirmed");
    const load = async () => {
      try {
        const all = await fetchFamilyActivity(conn, familyPda);
        if (cancelled) return;
        const payouts = all.filter(
          (e) => e.kind === "monthly" || e.kind === "bonus"
        );
        setEntries(payouts);
        setLoading(false);
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    // Payouts only fire monthly so polling every 30s is mostly idle — but it
    // catches the moment a new distribution lands while the kid has the page
    // open, which is the demo magic worth preserving.
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [familyPda]);

  if (loading) {
    return (
      <section className="kv-card kv-payouts">
        <div className="kv-card-eyebrow">{t("kid.payouts.eyebrow")}</div>
        <ul className="kv-wall-list">
          {Array.from({ length: 2 }).map((_, i) => (
            <li key={i} className="kv-wall-row kv-wall-row-skeleton">
              <span className="kv-wall-skeleton-name" />
              <span className="kv-wall-skeleton-amount" />
              <span className="kv-wall-skeleton-when" />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  if (entries.length === 0) {
    const future = nextAllowanceAt * 1000 > Date.now();
    const emptyCopy = future
      ? t("kid.payouts.empty", {
          date: new Intl.DateTimeFormat(locale, {
            month: "short",
            day: "numeric",
          }).format(new Date(nextAllowanceAt * 1000)),
        })
      : t("kid.payouts.empty.unknown");
    return (
      <section className="kv-card kv-payouts">
        <div className="kv-card-eyebrow">{t("kid.payouts.eyebrow")}</div>
        <div className="kv-payouts-empty">{emptyCopy}</div>
      </section>
    );
  }

  return (
    <section className="kv-card kv-payouts">
      <div className="kv-card-eyebrow">{t("kid.payouts.eyebrow")}</div>
      <ul className="kv-wall-list">
        {entries.map((entry) => {
          const formatted = new Intl.DateTimeFormat(locale, {
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(new Date(entry.ts * 1000));
          const label =
            entry.kind === "bonus"
              ? t("kid.payouts.bonus")
              : t("kid.payouts.monthly");
          return (
            <li
              key={entry.sig}
              className={
                entry.kind === "bonus"
                  ? "kv-wall-row kv-payout-bonus"
                  : "kv-wall-row"
              }
            >
              <span className="kv-wall-who">{label}</span>
              <span className="kv-wall-amount">
                ${entry.amountUsd.toFixed(2)}
              </span>
              <span className="kv-wall-when">{formatted}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
