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
        <div className="orda-scroll">
          <div className="orda-sheet-head">
            <div className="orda-sheet-title-wrap">
              <span className="orda-sheet-eyebrow">funds · brl ⇄ usdc</span>
              <h2 className="orda-sheet-title">add or withdraw money</h2>
              <p className="orda-sheet-subtitle">
                convert reais to usdc with pix — funds land in your connected
                wallet, then deposit into any kid&apos;s vault.
              </p>
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
    </div>
  );
}

const ORDA_STYLES = `
  /* Orda's asset/recipient dropdowns and Reown AppKit's wallet selector are
     portaled to <body> at their own z-indexes (typically 100–1000). Our
     overlay needs to sit BELOW that range so those popovers float above
     the modal naturally. We use 60 (above standard page chrome, below any
     reasonable popover/toast/wallet-modal value). */
  .orda-overlay {
    position: fixed; inset: 0;
    background: rgba(31, 27, 20, 0.55);
    z-index: 60;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    opacity: 0; pointer-events: none;
    transition: opacity 200ms ease;
  }
  .orda-overlay-open { opacity: 1; pointer-events: auto; }
  .orda-sheet {
    position: relative;
    width: 100%; max-width: 540px;
    max-height: calc(100vh - 48px);
    background: #FBF6E9;
    border: 1px solid var(--line, #DCD3BD);
    border-radius: 16px;
    box-shadow: 0 32px 80px -36px rgba(31, 27, 20, 0.55),
                0 4px 12px -6px rgba(31, 27, 20, 0.15);
    /* overflow:visible so the Orda widget's internal dropdowns/popovers
       (asset selector, recipient picker) can escape the sheet. The inner
       .orda-scroll handles vertical scrolling. */
    overflow: visible;
    display: flex; flex-direction: column;
  }
  .orda-scroll {
    display: flex; flex-direction: column;
    gap: 22px;
    padding: 30px 32px 24px;
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    /* overflow-x must be 'visible' to let popovers escape sideways, but if
       overflow-y is 'auto' the browser forces overflow-x to 'auto' too —
       that creates a clip context. The only way to keep popovers visible
       while scrolling is to give them explicit positioning above this
       scroll context, which we do with the !important rules below. */
    overflow-x: visible;
    /* inner scroll keeps the modal scrollable while letting absolute-positioned
       descendants (Orda popovers) bubble up via the parent's overflow:visible.
       Note: overflow-y:auto creates a clip context — Orda renders dropdowns via
       portals to body, which is why bumping overlay z-index to 9000 fixes
       them appearing behind the sheet. */
  }
  .orda-sheet-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px;
  }
  .orda-sheet-title-wrap {
    display: flex; flex-direction: column; gap: 8px;
    flex: 1; min-width: 0;
  }
  .orda-sheet-eyebrow {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10.5px; letter-spacing: 0.2em;
    color: #7A7461; text-transform: uppercase;
  }
  .orda-sheet-title {
    font-family: var(--font-instrument-serif), Georgia, serif;
    font-size: 32px; line-height: 1.05; letter-spacing: -0.015em;
    color: #1F1B14; margin: 0;
  }
  .orda-sheet-subtitle {
    font-size: 13px; line-height: 1.5;
    color: #5A5444; margin: 4px 0 0;
    max-width: 38ch;
  }
  .orda-close {
    width: 36px; height: 36px;
    background: transparent; border: 1px solid transparent;
    font-size: 22px; line-height: 1; color: #7A7461;
    cursor: pointer; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .orda-close:hover {
    background: rgba(31, 27, 20, 0.06);
    border-color: rgba(31, 27, 20, 0.08);
    color: #1F1B14;
  }
  .orda-sheet-body {
    margin: 0;
    padding: 4px 0 2px;
    /* Let Orda's portaled popovers float above the sheet. Anything Orda
       renders inside should be visually breathable. */
  }
  .orda-sheet-foot {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10.5px; letter-spacing: 0.08em;
    color: #7A7461; text-align: center;
    border-top: 1px dashed #DCD3BD;
    padding-top: 16px;
    margin-top: 4px;
  }
  .orda-sheet-foot span { color: #2E5C40; font-weight: 500; }

  /* Orda widget uses shadcn/ui = Radix UI under the hood (confirmed via
     element inspection — shadcn-style class strings on triggers). Radix
     portals popover/select/dialog content into [data-radix-popper-content-wrapper]
     and [data-radix-portal] elements, usually as direct children of <body>
     but not always (could be nested under a theme/root provider).
     We match at ANY depth so wherever the portal mounts, we win. */
  [data-radix-popper-content-wrapper],
  [data-radix-portal],
  [data-floating-ui-portal],
  [data-headlessui-portal],
  [data-orda-portal],
  w3m-modal,
  wcm-modal,
  appkit-modal {
    z-index: 12000 !important;
  }
  /* Radix Select/Popover/DropdownMenu Content elements (in case wrapper
     doesn't get the z-index, the content itself sometimes does) */
  [data-radix-select-content],
  [data-radix-popover-content],
  [data-radix-dropdown-menu-content],
  [data-radix-dialog-content] {
    z-index: 12001 !important;
  }
  /* Reown AppKit shadow-DOM web components honor this CSS variable */
  :root, body {
    --w3m-z-index: 12000;
  }

  @media (max-width: 540px) {
    .orda-overlay { padding: 12px; }
    .orda-scroll { padding: 24px 20px 20px; gap: 18px; }
    .orda-sheet-title { font-size: 26px; }
  }
`;
