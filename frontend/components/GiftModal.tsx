"use client";

// Gift modal for kid view. Anyone scans the QR with a Solana Pay-compatible
// wallet (Phantom, Solflare, Backpack mobile) and gifts USDC to the family
// vault. We don't sign anything — the wallet hits /api/gift/[familyPda] for
// the unsigned transaction, then the gifter signs in their own wallet.

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

const PRESETS = [1, 5, 20, 50] as const;

type Props = {
  familyPda: string;
  kidName: string | null;
  open: boolean;
  onClose: () => void;
};

export function GiftModal({ familyPda, kidName, open, onClose }: Props) {
  const [amountUsd, setAmountUsd] = useState<number>(20);
  const [customDraft, setCustomDraft] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Solana Pay URL the wallet consumes. Uses absolute origin so the QR is
  // valid regardless of where the page is served from.
  const giftUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const origin = window.location.origin;
    return `solana:${origin}/api/gift/${familyPda}?amount=${amountUsd}`;
  }, [familyPda, amountUsd]);

  // Render QR onto canvas whenever the URL changes.
  useEffect(() => {
    if (!open || !canvasRef.current || !giftUrl) return;
    QRCode.toCanvas(canvasRef.current, giftUrl, {
      width: 260,
      margin: 1,
      color: { dark: "#1F3A2A", light: "#FBF8F2" },
    }).catch(() => {
      // Intentionally swallow — modal degrades to copy-link only.
    });
  }, [open, giftUrl]);

  // Copy full Solana Pay URL (the same payload that's encoded in the QR).
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(giftUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Older browsers without permissions API — silent.
    }
  };

  // Lock body scroll while open.
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

  if (!open) return null;

  const greetingName = kidName ?? "this family";

  return (
    <div className="gm-overlay" onClick={onClose}>
      <style dangerouslySetInnerHTML={{ __html: GIFT_MODAL_STYLES }} />
      <div className="gm-sheet" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="gm-close"
          onClick={onClose}
          aria-label="close"
        >
          ×
        </button>

        <div className="gm-eyebrow">give to · seedling</div>
        <h2 className="gm-title">
          send a gift to <em>{greetingName}</em>
        </h2>
        <p className="gm-sub">
          Anyone with a Solana wallet can gift. The USDC lands in
          {kidName ? ` ${kidName}'s` : " the family's"} seedling vault and
          starts earning yield.
        </p>

        <div className="gm-amount-row">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`gm-chip ${amountUsd === p ? "gm-chip-on" : ""}`}
              onClick={() => {
                setAmountUsd(p);
                setCustomDraft("");
              }}
            >
              ${p}
            </button>
          ))}
          <input
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            placeholder="custom"
            className="gm-custom"
            value={customDraft}
            onChange={(e) => {
              const raw = e.target.value;
              setCustomDraft(raw);
              const n = Number(raw);
              if (Number.isFinite(n) && n > 0 && n <= 1000) setAmountUsd(n);
            }}
          />
        </div>

        <div className="gm-qr-frame">
          <canvas ref={canvasRef} className="gm-qr" />
        </div>

        <div className="gm-mobile-row">
          <a href={giftUrl} className="gm-deep-link">
            open in wallet app
          </a>
          <button type="button" className="gm-copy-btn" onClick={handleCopy}>
            {copied ? "copied" : "copy link"}
          </button>
        </div>

        <div className="gm-foot">
          scan with Phantom, Solflare, or Backpack on mobile
        </div>
      </div>
    </div>
  );
}

const GIFT_MODAL_STYLES = `
  .gm-overlay {
    position: fixed; inset: 0;
    background: rgba(31, 58, 42, 0.45);
    display: flex; align-items: flex-end; justify-content: center;
    z-index: 50;
    animation: gm-fade 200ms ease-out;
  }
  @keyframes gm-fade { from { opacity: 0; } to { opacity: 1; } }

  .gm-sheet {
    position: relative;
    background: #FBF8F2;
    width: 100%; max-width: 480px;
    border-radius: 24px 24px 0 0;
    padding: 22px 24px 32px;
    display: flex; flex-direction: column; gap: 14px;
    animation: gm-slide 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
    box-shadow: 0 -20px 60px rgba(31, 58, 42, 0.18);
  }
  @keyframes gm-slide {
    from { transform: translateY(20px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }
  @media (min-width: 540px) {
    .gm-overlay { align-items: center; }
    .gm-sheet { border-radius: 24px; max-width: 440px; }
  }

  .gm-close {
    position: absolute; top: 12px; right: 16px;
    width: 32px; height: 32px;
    border: none; background: transparent;
    font-size: 28px; line-height: 1;
    color: #6F6A58; cursor: pointer;
    border-radius: 50%;
  }
  .gm-close:hover { background: #ECE4D2; color: #2A2A22; }

  .gm-eyebrow {
    font-family: var(--font-jetbrains-mono), ui-monospace, monospace;
    font-size: 11px; letter-spacing: 0.18em;
    text-transform: uppercase; color: #6F6A58;
  }
  .gm-title {
    font-family: var(--font-instrument-serif), Georgia, serif;
    font-weight: 400; font-size: 32px;
    line-height: 1.1; letter-spacing: -0.01em;
    color: #1F3A2A; margin: 0;
  }
  .gm-title em { font-style: italic; color: #2E5C40; }
  .gm-sub {
    font-family: var(--font-inter), -apple-system, sans-serif;
    font-size: 14px; line-height: 1.5;
    color: #6F6A58; margin: 0;
  }

  .gm-amount-row {
    display: flex; gap: 8px; flex-wrap: wrap;
    margin-top: 4px;
  }
  .gm-chip {
    font-family: var(--font-jetbrains-mono), monospace;
    padding: 8px 14px;
    border: 1px solid #D9CFB8;
    border-radius: 99px;
    background: #FBF8F2; color: #2A2A22;
    cursor: pointer; font-size: 13px;
    letter-spacing: 0.02em;
    transition: all 140ms ease;
  }
  .gm-chip:hover { border-color: #2E5C40; }
  .gm-chip-on {
    background: #2E5C40; color: #FBF8F2;
    border-color: #2E5C40;
  }
  .gm-custom {
    font-family: var(--font-jetbrains-mono), monospace;
    flex: 1; min-width: 80px;
    padding: 8px 14px;
    border: 1px solid #D9CFB8;
    border-radius: 99px;
    background: #FBF8F2; color: #2A2A22;
    font-size: 13px; outline: none;
  }
  .gm-custom:focus { border-color: #2E5C40; }
  .gm-custom::-webkit-outer-spin-button,
  .gm-custom::-webkit-inner-spin-button {
    -webkit-appearance: none; margin: 0;
  }

  .gm-qr-frame {
    align-self: center;
    padding: 14px;
    background: #FBF8F2;
    border: 1px solid #ECE4D2;
    border-radius: 16px;
    margin-top: 6px;
  }
  .gm-qr { display: block; width: 260px; height: 260px; }

  .gm-mobile-row { display: flex; gap: 10px; }
  .gm-deep-link {
    flex: 1;
    display: inline-flex; align-items: center; justify-content: center;
    padding: 12px 16px;
    background: #2E5C40; color: #FBF8F2;
    border-radius: 12px;
    text-decoration: none;
    font-family: var(--font-inter), sans-serif;
    font-size: 14px; font-weight: 500;
    letter-spacing: 0.02em;
    transition: background 140ms ease;
  }
  .gm-deep-link:hover { background: #244A33; }
  .gm-copy-btn {
    padding: 12px 16px;
    background: #FBF8F2; color: #2A2A22;
    border: 1px solid #D9CFB8;
    border-radius: 12px;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 12px; cursor: pointer;
    letter-spacing: 0.04em;
    transition: all 140ms ease;
  }
  .gm-copy-btn:hover { border-color: #2E5C40; color: #2E5C40; }

  .gm-foot {
    text-align: center;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px; letter-spacing: 0.06em;
    color: #8A8169; margin-top: 4px;
  }
`;
