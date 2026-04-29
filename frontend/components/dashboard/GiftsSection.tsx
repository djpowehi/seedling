"use client";

// Parent dashboard's gift activity strip. Mirrors the kid view's gift wall
// but adds two parent-only flows:
//   1. naming unknown gifters — write through to localStorage so the kid
//      view picks up the human-readable label on next render
//   2. toasts on first sight of a new gift sig — gives parent a passive
//      heads-up when grandma scans the QR
//
// Keeps to the dashboard's stone+serif aesthetic. No new style system —
// reuses dash-row, dash-col, dash-mono, dash-serif from styles.ts.

import { useEffect, useRef, useState } from "react";
import type { Connection, PublicKey } from "@solana/web3.js";

import { fetchGifts, type GiftEntry } from "@/lib/fetchGifts";
import {
  getGiftNames,
  setGiftName,
  shortPubkey,
  timeAgo,
} from "@/lib/giftNames";
import { useToast } from "@/components/Toast";

const SEEN_KEY_PREFIX = "seedling-gift-seen-";

type Props = {
  familyPda: PublicKey;
  parent: PublicKey;
  kidName: string | null;
  connection: Connection;
};

function getSeenSet(familyPdaStr: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_KEY_PREFIX + familyPdaStr);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function persistSeenSet(familyPdaStr: string, set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SEEN_KEY_PREFIX + familyPdaStr,
      JSON.stringify(Array.from(set))
    );
  } catch {
    // Quota or disabled — silent. The wall still works on its own.
  }
}

export function GiftsSection({
  familyPda,
  parent,
  kidName,
  connection,
}: Props) {
  const familyPdaStr = familyPda.toBase58();
  const [gifts, setGifts] = useState<GiftEntry[]>([]);
  const [giftsLoading, setGiftsLoading] = useState(true);
  const [names, setNames] = useState<Record<string, string>>({});
  const [editingPubkey, setEditingPubkey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const { showToast } = useToast();

  // Initial state from localStorage.
  useEffect(() => {
    setNames(getGiftNames(familyPdaStr));
    seenRef.current = getSeenSet(familyPdaStr);
  }, [familyPdaStr]);

  // Poll for gifts. First load establishes the "seen" baseline silently;
  // subsequent fetches toast for any sig we haven't seen yet.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const list = await fetchGifts(connection, familyPda, parent);
        if (cancelled) return;
        setGifts(list);
        setGiftsLoading(false);

        // Toast new gifts — but skip the first load so we don't toast
        // historical entries every page-mount. Only re-persist when the
        // seen-set actually changed (avoids 1 needless localStorage write
        // per 30s poll on quiet dashboards).
        let dirty = false;
        if (initializedRef.current) {
          const currentNames = getGiftNames(familyPdaStr);
          for (const g of list) {
            if (seenRef.current.has(g.sig)) continue;
            seenRef.current.add(g.sig);
            dirty = true;
            // Three-tier name resolution mirrors the kid view.
            const who = g.fromName ?? currentNames[g.depositor] ?? "Someone";
            const recipient = kidName ?? "your family";
            showToast({
              title: `${who} gifted $${g.amountUsd.toFixed(2)} to ${recipient}`,
              subtitle: "GIFT · SEEDLING",
            });
          }
        } else {
          for (const g of list) {
            if (!seenRef.current.has(g.sig)) {
              seenRef.current.add(g.sig);
              dirty = true;
            }
          }
          initializedRef.current = true;
        }
        if (dirty) persistSeenSet(familyPdaStr, seenRef.current);
      } catch {
        if (!cancelled) setGiftsLoading(false);
        // Silent retry on next interval.
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connection, familyPda, familyPdaStr, parent, kidName, showToast]);

  const startEditName = (pubkey: string, suggestedFrom?: string) => {
    setEditingPubkey(pubkey);
    // Seed the draft with whatever's currently visible (parent override
    // first, then the gifter's self-chosen name) so the parent rarely has
    // to type from scratch.
    setDraft(names[pubkey] ?? suggestedFrom ?? "");
  };

  const saveName = () => {
    if (!editingPubkey) return;
    const trimmed = draft.trim();
    if (trimmed) {
      setGiftName(familyPdaStr, editingPubkey, trimmed);
      setNames({ ...names, [editingPubkey]: trimmed });
    }
    setEditingPubkey(null);
    setDraft("");
  };

  // Render the section as soon as we mount (with skeleton rows during the
  // initial fetch) so the parent doesn't see the page "pop" 30 seconds in.
  // Once the fetch returns and there are zero gifts, the section is hidden.
  if (!giftsLoading && gifts.length === 0) return null;

  const skeletonStyles = `
    @keyframes dash-skel-pulse {
      0%, 100% { opacity: 0.45; }
      50%      { opacity: 0.85; }
    }
  `;

  return (
    <div
      className="dash-col"
      style={{
        gap: 14,
        marginTop: 28,
        paddingTop: 20,
        borderTop: "1px solid var(--line-soft)",
      }}
      // Local keyframe — dashboard styles.ts doesn't have a skeleton pulse.
      // Cheaper than threading through a global. See <style> below.
    >
      <style dangerouslySetInnerHTML={{ __html: skeletonStyles }} />
      <div
        className="dash-row"
        style={{
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <span
          className="dash-mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--ink-3)",
          }}
        >
          gifts received
        </span>
        <span
          className="dash-mono"
          style={{ fontSize: 10, color: "var(--ink-3)" }}
        >
          {giftsLoading ? "loading…" : `${gifts.length} total`}
        </span>
      </div>

      <div className="dash-col" style={{ gap: 0 }}>
        {giftsLoading &&
          gifts.length === 0 &&
          Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="dash-row"
              style={{
                gap: 12,
                alignItems: "center",
                padding: "10px 0",
                borderTop: "1px dashed var(--line-soft)",
                opacity: 0.55,
                animation: "dash-skel-pulse 1.4s ease-in-out infinite",
              }}
            >
              <span
                style={{
                  height: 16,
                  width: "32%",
                  background: "var(--line-soft)",
                  borderRadius: 4,
                }}
              />
              <span
                style={{
                  height: 12,
                  width: 44,
                  background: "var(--line-soft)",
                  borderRadius: 4,
                  marginLeft: "auto",
                }}
              />
              <span
                style={{
                  height: 10,
                  width: 50,
                  background: "var(--line-soft)",
                  borderRadius: 4,
                }}
              />
            </div>
          ))}
        {gifts.slice(0, 8).map((g) => {
          // Three-tier resolution. Parent override beats the gifter's
          // self-chosen name (parent's home, parent's labels), but we
          // still surface the gifter's name as a sensible default.
          const overrideName = names[g.depositor];
          const display = overrideName ?? g.fromName;
          const isEditing = editingPubkey === g.depositor;
          return (
            <div
              key={g.sig}
              className="dash-row"
              style={{
                gap: 12,
                alignItems: "center",
                padding: "10px 0",
                borderTop: "1px dashed var(--line-soft)",
              }}
            >
              <div
                className="dash-col"
                style={{ flex: 1, minWidth: 0, gap: 2 }}
              >
                {isEditing ? (
                  <div className="dash-row" style={{ gap: 6 }}>
                    <input
                      autoFocus
                      className="dash-rename-input"
                      style={{ fontSize: 14, flex: 1 }}
                      value={draft}
                      placeholder="Grandma, Uncle Tom, …"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveName();
                        if (e.key === "Escape") {
                          setEditingPubkey(null);
                          setDraft("");
                        }
                      }}
                    />
                    <button
                      className="dash-btn-link"
                      onClick={saveName}
                      style={{ fontSize: 11 }}
                    >
                      save
                    </button>
                  </div>
                ) : display ? (
                  <button
                    type="button"
                    className="dash-btn-link"
                    onClick={() => startEditName(g.depositor, g.fromName)}
                    style={{
                      fontSize: 16,
                      fontFamily: "var(--font-instrument-serif), serif",
                      color: "var(--ink)",
                      textAlign: "left",
                      padding: 0,
                    }}
                    title={
                      overrideName
                        ? "click to rename"
                        : g.fromName
                        ? "name supplied by the gifter — click to override"
                        : "click to name"
                    }
                  >
                    {display}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="dash-btn-link"
                    onClick={() => startEditName(g.depositor, g.fromName)}
                    style={{
                      fontSize: 13,
                      textAlign: "left",
                      padding: 0,
                    }}
                  >
                    name {shortPubkey(g.depositor)}
                  </button>
                )}
              </div>
              <span
                className="dash-mono"
                style={{
                  fontSize: 12,
                  color: "var(--ink-2)",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                }}
              >
                ${g.amountUsd.toFixed(2)}
              </span>
              <span
                className="dash-mono"
                style={{
                  fontSize: 10,
                  color: "var(--ink-3)",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.04em",
                }}
              >
                {timeAgo(g.ts)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
