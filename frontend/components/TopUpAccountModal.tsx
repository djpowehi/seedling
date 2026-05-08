"use client";

// Top-up Account modal — surfaces the parent's Solana wallet address +
// QR + copy affordance + plain-language instructions on how to fund it
// with USDC from any external wallet or exchange.
//
// Why this exists: Privy embedded wallets are intentionally invisible to
// non-crypto parents (they log in with Google, never see a seed phrase,
// never have to "manage a wallet"). But that abstraction blocks the path
// for users who DO have USDC elsewhere (Phantom, Coinbase, Binance, etc.)
// and want to deposit without going through Pix. This modal is the
// escape hatch: shows the address, hides nothing, but keeps the language
// fintech-flavoured ("top up your Seedling balance") rather than
// crypto-flavoured ("send to your wallet pubkey").
//
// The address shown is the wallet pubkey (system-account address). All
// consumer wallets and exchanges auto-resolve this to the USDC ATA on
// send, so 99% of users don't need to know about ATA derivation. Power
// users sending raw SPL transfers may need the ATA — but that's an
// edge case we don't surface in v1.

import { useEffect, useRef } from "react";
import QRCode from "qrcode";
import type { PublicKey } from "@solana/web3.js";

import { useToast } from "@/components/Toast";
import { useLocale } from "@/lib/i18n";

type Props = {
  walletPubkey: PublicKey;
  onClose: () => void;
};

export function TopUpAccountModal({ walletPubkey, onClose }: Props) {
  const { showToast } = useToast();
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const address = walletPubkey.toBase58();

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, address, {
      width: 180,
      margin: 1,
      color: { dark: "#1F3A2A", light: "#FBF8F2" },
    }).catch(() => {
      // QR is a secondary affordance — copy-paste address is the primary
      // path. Swallow render failure so the modal still functions.
    });
  }, [address]);

  // Escape closes the modal — standard a11y for overlay UIs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(address);
      showToast({ title: t("topup.toast.copied") });
    } catch {
      // Clipboard API can fail in non-secure contexts or sandboxed
      // browsers. Surface a non-fatal hint so the user knows to copy
      // manually rather than thinking the click did nothing.
      showToast({ title: t("topup.toast.copy_failed") });
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("topup.title")}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(31, 58, 42, 0.45)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--paper, #FBF8F2)",
          borderRadius: 14,
          padding: "32px 28px 24px",
          maxWidth: 440,
          width: "100%",
          boxShadow: "0 20px 60px -10px rgba(31, 58, 42, 0.25)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 4,
          }}
        >
          <h2
            style={{
              fontFamily: '"Iowan Old Style", Georgia, serif',
              fontSize: 26,
              fontWeight: 400,
              color: "#1F3A2A",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            {t("topup.title")}
          </h2>
          <button
            onClick={onClose}
            aria-label={t("topup.close")}
            style={{
              background: "transparent",
              border: "none",
              color: "#6F6A58",
              fontSize: 18,
              cursor: "pointer",
              padding: "4px 6px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <p
          style={{
            color: "#6F6A58",
            fontSize: 13,
            margin: "0 0 20px",
            lineHeight: 1.5,
          }}
        >
          {t("topup.subtitle")}
        </p>

        {/* QR */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 18,
          }}
        >
          <div
            style={{
              padding: 12,
              background: "#FBF8F2",
              border: "1px solid #ECE4D2",
              borderRadius: 10,
            }}
          >
            <canvas ref={canvasRef} />
          </div>
        </div>

        {/* Address + copy */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
              fontSize: 11,
              color: "#8A8169",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              marginBottom: 6,
            }}
          >
            {t("topup.address.label")}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                flex: 1,
                fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
                fontSize: 11,
                background: "#F1ECDC",
                color: "#5A4A36",
                padding: "10px 12px",
                borderRadius: 8,
                wordBreak: "break-all",
                lineHeight: 1.4,
              }}
            >
              {address}
            </div>
            <button
              onClick={handleCopy}
              className="dash-btn dash-btn-ghost"
              style={{
                whiteSpace: "nowrap",
                padding: "10px 14px",
                fontSize: 12,
              }}
            >
              {t("topup.copy")}
            </button>
          </div>
        </div>

        {/* Network indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            background: "rgba(46, 92, 64, 0.08)",
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 12,
            color: "#1F3A2A",
          }}
        >
          <span aria-hidden="true">●</span>
          <span
            style={{ fontFamily: 'ui-monospace, "JetBrains Mono", monospace' }}
          >
            {t("topup.network")}
          </span>
        </div>

        {/* Warning */}
        <div
          style={{
            display: "flex",
            gap: 10,
            padding: "10px 14px",
            background: "rgba(176, 71, 58, 0.08)",
            border: "1px solid rgba(176, 71, 58, 0.2)",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 12,
            color: "#7A2E25",
            lineHeight: 1.5,
          }}
        >
          <span aria-hidden="true" style={{ flexShrink: 0 }}>
            ⚠️
          </span>
          <span>{t("topup.warning")}</span>
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#6F6A58",
            lineHeight: 1.6,
            background: "#F8F2E0",
            padding: "12px 14px",
            borderRadius: 8,
          }}
        >
          {t("topup.next_step")}
        </div>
      </div>
    </div>
  );
}
