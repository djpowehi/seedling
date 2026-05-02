"use client";

// Orda fiat on/off-ramp widget — wrapped in our own modal chrome so it
// fits the dashboard's voice. The widget itself handles wallet
// connection (via Reown / WalletConnect), quote fetching, recipient
// management, and the actual money movement (BRL → USDC via PIX, and
// reverse).
//
// Why a modal: the widget is large (~440 × 600) and self-contained.
// Embedding it inline on the dashboard would shove the family cards
// down too much. Modal pops over, parent does the conversion, dismisses.
//
// Network coverage at time of writing: Brazil PIX is LIVE (all we need
// today); USA/Europe/Mexico are "in progress" per Orda docs. If a
// non-Brazil parent opens this, the widget will tell them their region
// isn't supported yet. That's Orda's UX, not ours.

import { useEffect, useMemo, useState } from "react";
import {
  OrdaProvider,
  Widget,
  createAppKitConfig,
} from "@ordanetwork/sdk/react";
import "@ordanetwork/sdk/react/styles.css";

type Props = {
  open: boolean;
  onClose: () => void;
};

// Created at module level (not inside the component) per Orda's SSR-safety
// note in the docs — Reown's AppKit registers a global handler on first
// import and re-registering on every render breaks it.
const appKitConfig = createAppKitConfig({
  projectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ?? "",
  metadata: {
    name: "Seedling",
    description: "Yield-bearing allowance for kids",
    url: "https://seedlingsol.xyz",
    icons: ["https://seedlingsol.xyz/favicon.ico"],
  },
});

export function OrdaWidgetModal({ open, onClose }: Props) {
  // The widget is heavy (Reown + wagmi + viem + WalletConnect protocol).
  // Lazy-mount: only construct the provider tree when the modal opens.
  // First open will be slower (~1s); subsequent opens are instant
  // because React keeps the tree mounted.
  const [hasOpened, setHasOpened] = useState(false);
  useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const providerConfig = useMemo(
    () => ({
      // The widget calls this when it needs a token. It returns
      // { jwt, expiresAt }; the widget caches and refreshes near expiry.
      getToken: async () => {
        const res = await fetch("/api/auth/orda-jwt", { method: "POST" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(
            (err as { error?: string }).error ?? "Failed to get Orda JWT"
          );
        }
        return res.json();
      },
      appKitConfig,
      debug: process.env.NODE_ENV === "development",
    }),
    []
  );

  if (!open && !hasOpened) return null;

  return (
    <div
      className={`orda-overlay${open ? " orda-overlay-open" : ""}`}
      onClick={onClose}
    >
      <style dangerouslySetInnerHTML={{ __html: ORDA_STYLES }} />
      <div
        className="orda-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add or withdraw funds"
      >
        <div className="orda-sheet-head">
          <div className="orda-sheet-title-wrap">
            <span className="orda-sheet-eyebrow">funds · brl ⇄ usdc</span>
            <h2 className="orda-sheet-title">add or withdraw money</h2>
          </div>
          <button
            type="button"
            className="orda-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="orda-sheet-body">
          <OrdaProvider config={providerConfig}>
            <Widget />
          </OrdaProvider>
        </div>
        <div className="orda-sheet-foot">
          powered by <span>orda</span> · pix → usdc · usdc → pix
        </div>
      </div>
    </div>
  );
}

const ORDA_STYLES = `
  .orda-overlay {
    position: fixed; inset: 0;
    background: rgba(31, 27, 20, 0.55);
    z-index: 90;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    opacity: 0; pointer-events: none;
    transition: opacity 200ms ease;
  }
  .orda-overlay-open { opacity: 1; pointer-events: auto; }
  .orda-sheet {
    position: relative;
    width: 100%; max-width: 480px;
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    background: #FBF6E9;
    border: 1px solid var(--line, #DCD3BD);
    border-radius: 12px;
    padding: 20px 22px 18px;
    display: flex; flex-direction: column;
    gap: 14px;
    box-shadow: 0 26px 60px -32px rgba(31, 27, 20, 0.5);
  }
  .orda-sheet-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 14px;
  }
  .orda-sheet-title-wrap {
    display: flex; flex-direction: column; gap: 4px;
  }
  .orda-sheet-eyebrow {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10.5px; letter-spacing: 0.18em;
    color: #7A7461; text-transform: uppercase;
  }
  .orda-sheet-title {
    font-family: var(--font-instrument-serif), Georgia, serif;
    font-size: 26px; line-height: 1; letter-spacing: -0.01em;
    color: #1F1B14; margin: 0;
  }
  .orda-close {
    width: 32px; height: 32px;
    background: transparent; border: none;
    font-size: 24px; line-height: 1; color: #7A7461;
    cursor: pointer; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
  }
  .orda-close:hover { background: rgba(31, 27, 20, 0.05); color: #1F1B14; }
  .orda-sheet-body {
    /* Orda widget brings its own theme + chrome; we just give it a
       container that respects the modal's edges. */
    margin: 0;
  }
  .orda-sheet-foot {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10.5px; letter-spacing: 0.06em;
    color: #7A7461; text-align: center;
    border-top: 1px dashed #DCD3BD;
    padding-top: 12px;
  }
  .orda-sheet-foot span { color: #2E5C40; font-weight: 500; }
`;
