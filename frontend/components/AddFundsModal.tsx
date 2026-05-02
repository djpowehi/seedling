"use client";

// Add/withdraw funds modal — our own UI on top of Orda's REST API.
// Replaces OrdaWidgetModal (which dragged in Reown AppKit + EVM/wagmi
// machinery and broke z-index because of it). Deposits BRL → USDC via
// PIX; withdraws USDC → BRL via PIX.
//
// All Orda calls go through /api/orda/* server routes that hold the
// HMAC secret. Browser only sees public quote data.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import QRCode from "qrcode";

const MAINNET_USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

type Tab = "deposit" | "withdraw";

type Props = {
  open: boolean;
  onClose: () => void;
};

type OnrampQuote = {
  transactionId: string | number;
  pixQrCode: string | null;
  pixKey: string | null;
  amount: number;
  currency: string;
  referenceId: string;
  expiresAt: string;
  toAmount: string;
  exchangeRate: number;
};

type OnrampStatus = {
  status: string;
  depositStatus: string;
  cryptoAmount: unknown;
  fiatAmount: unknown;
};

type OfframpQuote = {
  transactionId: string | number;
  fromAmount: string;
  toAmount: string;
  exchangeRate: string;
  estimatedDuration: number;
};

type OfframpStatus = {
  status: string;
  depositAddress: string;
  withdrawalAmount: string;
};

type KYCInfo = {
  name: string;
  taxId: string;
  taxIdCountry: string;
  email: string;
};

const KYC_KEY = "seedling.ordaKyc";

function readKyc(): KYCInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KYC_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.name && parsed?.taxId && parsed?.email) return parsed;
    return null;
  } catch {
    return null;
  }
}

function writeKyc(kyc: KYCInfo): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KYC_KEY, JSON.stringify(kyc));
  } catch {
    /* quota — silent */
  }
}

export function AddFundsModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("deposit");

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fund-overlay fund-overlay-open" onClick={onClose}>
      <style dangerouslySetInnerHTML={{ __html: FUND_STYLES }} />
      <div
        className="fund-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tab === "deposit" ? "Add funds" : "Withdraw funds"}
      >
        <div className="fund-head">
          <div className="fund-title-wrap">
            <span className="fund-eyebrow">funds · brl ⇄ usdc · pix</span>
            <h2 className="fund-title">
              {tab === "deposit" ? "add money" : "withdraw money"}
            </h2>
            <p className="fund-sub">
              {tab === "deposit"
                ? "convert reais to usdc with pix. usdc lands in your connected wallet."
                : "send usdc from your wallet, receive reais via pix."}
            </p>
          </div>
          <button
            type="button"
            className="fund-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="fund-tabs">
          <button
            className={`fund-tab${tab === "deposit" ? " fund-tab-active" : ""}`}
            onClick={() => setTab("deposit")}
          >
            deposit
          </button>
          <button
            className={`fund-tab${
              tab === "withdraw" ? " fund-tab-active" : ""
            }`}
            onClick={() => setTab("withdraw")}
          >
            withdraw
          </button>
        </div>

        <div className="fund-body">
          {tab === "deposit" ? <DepositFlow /> : <WithdrawFlow />}
        </div>

        <div className="fund-foot">
          powered by <span>orda</span> · pix → usdc · usdc → pix
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Deposit (on-ramp): BRL → USDC
// ─────────────────────────────────────────────────────────────────────

function DepositFlow() {
  const { publicKey } = useWallet();
  const [amountBrl, setAmountBrl] = useState("100");
  const [quote, setQuote] = useState<OnrampQuote | null>(null);
  const [status, setStatus] = useState<OnrampStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const amountNum = Number(amountBrl) || 0;
  const previewUsdc = useMemo(() => {
    // Best-effort preview before hitting the API. Real number comes back
    // with the quote. ~5.2 BRL/USD as a placeholder; swap with /prices
    // call if/when we surface a live rate.
    if (amountNum <= 0) return null;
    return (amountNum / 5.2).toFixed(2);
  }, [amountNum]);

  const requestQuote = useCallback(async () => {
    if (!publicKey || amountNum <= 0) return;
    setLoading(true);
    setError(null);
    setStatus(null);
    setQuote(null);
    setQrDataUrl(null);
    try {
      const res = await fetch("/api/orda/onramp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountBrl: amountNum,
          toAddress: publicKey.toBase58(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Quote failed");
      setQuote(data);
      if (data.pixQrCode) {
        const url = await QRCode.toDataURL(data.pixQrCode, {
          width: 240,
          margin: 1,
          color: { dark: "#1F1B14", light: "#FBF6E9" },
        });
        setQrDataUrl(url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [publicKey, amountNum]);

  // Poll status while quote is active and not in a terminal state.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!quote) return;
    const txId = quote.transactionId;

    const tick = async () => {
      try {
        const res = await fetch(`/api/orda/onramp/status/${txId}`);
        const data = (await res.json()) as OnrampStatus & { error?: string };
        if (!res.ok) return;
        setStatus(data);
        const s = data.status?.toLowerCase();
        if (s === "completed" || s === "failed" || s === "cancelled") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        /* transient — retry on next tick */
      }
    };
    tick();
    pollRef.current = setInterval(tick, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [quote]);

  const copyPixKey = async () => {
    if (!quote?.pixKey) return;
    try {
      await navigator.clipboard.writeText(quote.pixKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (!publicKey) {
    return (
      <div className="fund-empty">
        <span className="fund-mono">connect a wallet to deposit.</span>
      </div>
    );
  }

  // Stage 2: Show PIX QR + status polling
  if (quote) {
    const statusLabel = statusLabelOnramp(status);
    const statusTone = statusToneOnramp(status);
    return (
      <div className="fund-stage">
        <div className="fund-stage-head">
          <div>
            <span className="fund-mono fund-eyebrow-sm">pay with pix</span>
            <div className="fund-stage-amount">
              R$ {Number(quote.amount).toFixed(2)}
              <span className="fund-stage-arrow">→</span>${quote.toAmount} USDC
            </div>
          </div>
          <span className={`fund-pill fund-pill-${statusTone}`}>
            {statusLabel}
          </span>
        </div>

        {qrDataUrl && (
          <div className="fund-qr-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="PIX QR code" className="fund-qr" />
          </div>
        )}

        {quote.pixKey && (
          <div className="fund-copy-row">
            <code className="fund-copy-code">{quote.pixKey}</code>
            <button
              className="dash-btn dash-btn-ghost"
              onClick={copyPixKey}
              type="button"
            >
              {copied ? "copied" : "copy code"}
            </button>
          </div>
        )}

        <div className="fund-meta">
          <div>
            <span className="fund-meta-label">expires</span>
            <span className="fund-meta-val">
              {formatExpiry(quote.expiresAt)}
            </span>
          </div>
          <div>
            <span className="fund-meta-label">rate</span>
            <span className="fund-meta-val">
              R$ {quote.exchangeRate.toFixed(2)} / $1
            </span>
          </div>
          <div>
            <span className="fund-meta-label">ref</span>
            <span className="fund-meta-val fund-meta-mono">
              {quote.referenceId.slice(0, 10)}…
            </span>
          </div>
        </div>

        <button
          type="button"
          className="dash-btn dash-btn-ghost fund-restart"
          onClick={() => {
            setQuote(null);
            setStatus(null);
            setQrDataUrl(null);
          }}
        >
          ← new deposit
        </button>
      </div>
    );
  }

  // Stage 1: Amount input
  return (
    <div className="fund-stage">
      <label className="fund-field">
        <span className="fund-mono fund-eyebrow-sm">amount in reais</span>
        <div className="fund-input-row">
          <span className="fund-prefix">R$</span>
          <input
            type="number"
            min="1"
            step="1"
            value={amountBrl}
            onChange={(e) => setAmountBrl(e.target.value)}
            className="fund-input"
            placeholder="100"
          />
        </div>
      </label>

      {previewUsdc && (
        <div className="fund-preview">
          you&apos;ll receive ≈ <strong>${previewUsdc} USDC</strong>{" "}
          <span className="fund-preview-hint">(final amount in next step)</span>
        </div>
      )}

      {error && <div className="fund-error">{error}</div>}

      <button
        type="button"
        className="dash-btn dash-btn-primary fund-cta"
        disabled={!publicKey || amountNum < 1 || loading}
        onClick={requestQuote}
      >
        {loading ? "generating quote…" : "generate pix"}
      </button>

      <p className="fund-foot-note">
        usdc lands in{" "}
        <code>
          {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
        </code>{" "}
        after your pix payment clears (typically &lt; 30 seconds).
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Withdraw (off-ramp): USDC → BRL
// ─────────────────────────────────────────────────────────────────────

function WithdrawFlow() {
  const { publicKey, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [kyc, setKyc] = useState<KYCInfo>(
    () => readKyc() ?? { name: "", taxId: "", taxIdCountry: "BR", email: "" }
  );
  const [amountUsdc, setAmountUsdc] = useState("10");
  const [pixKey, setPixKey] = useState("");
  const [quote, setQuote] = useState<OfframpQuote | null>(null);
  const [status, setStatus] = useState<OfframpStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amountUsdc) || 0;
  const previewBrl = useMemo(() => {
    if (amountNum <= 0) return null;
    return (amountNum * 5.2).toFixed(2);
  }, [amountNum]);

  const submitQuote = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    try {
      writeKyc(kyc);
      const res = await fetch("/api/orda/offramp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountUsdc: amountNum,
          fromAddress: publicKey.toBase58(),
          pixKey,
          kyc,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Quote failed");
      setQuote(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [publicKey, amountNum, pixKey, kyc]);

  // Poll status to get the depositAddress.
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!quote) return;
    const txId = quote.transactionId;

    const tick = async () => {
      try {
        const res = await fetch(`/api/orda/offramp/status/${txId}`);
        const data = (await res.json()) as OfframpStatus & { error?: string };
        if (!res.ok) return;
        setStatus(data);
        const s = data.status?.toLowerCase();
        if (s === "completed" || s === "failed" || s === "refunded") {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        /* retry */
      }
    };
    tick();
    pollRef.current = setInterval(tick, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [quote]);

  const sendUsdc = useCallback(async () => {
    if (!publicKey || !status?.depositAddress) return;
    setSigning(true);
    setError(null);
    try {
      const recipient = new PublicKey(status.depositAddress);
      const fromAta = await getAssociatedTokenAddress(
        MAINNET_USDC_MINT,
        publicKey
      );
      const toAta = await getAssociatedTokenAddress(
        MAINNET_USDC_MINT,
        recipient
      );
      const lamports = BigInt(Math.round(amountNum * 1_000_000));

      const tx = new Transaction().add(
        createTransferInstruction(fromAta, toAta, publicKey, lamports)
      );
      tx.feePayer = publicKey;
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;

      const sig = await sendTransaction(tx, connection);
      setSignature(sig);
      await connection.confirmTransaction(sig, "confirmed");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigning(false);
    }
  }, [publicKey, status, amountNum, connection, sendTransaction]);

  if (!publicKey) {
    return (
      <div className="fund-empty">
        <span className="fund-mono">connect a wallet to withdraw.</span>
      </div>
    );
  }

  // Stage 2: Send USDC to depositAddress + status polling
  if (quote) {
    const statusLabel = statusLabelOfframp(status);
    const statusTone = statusToneOfframp(status);
    return (
      <div className="fund-stage">
        <div className="fund-stage-head">
          <div>
            <span className="fund-mono fund-eyebrow-sm">send usdc</span>
            <div className="fund-stage-amount">
              ${quote.fromAmount} USDC
              <span className="fund-stage-arrow">→</span>R$ {quote.toAmount}
            </div>
          </div>
          <span className={`fund-pill fund-pill-${statusTone}`}>
            {statusLabel}
          </span>
        </div>

        {status?.depositAddress ? (
          <>
            <div className="fund-deposit-card">
              <div>
                <span className="fund-mono fund-eyebrow-sm">
                  deposit address
                </span>
                <code className="fund-deposit-addr">
                  {status.depositAddress}
                </code>
              </div>
              <button
                type="button"
                className="dash-btn dash-btn-primary"
                onClick={sendUsdc}
                disabled={signing || Boolean(signature)}
              >
                {signature
                  ? "sent ✓"
                  : signing
                  ? "signing…"
                  : `send ${quote.fromAmount} usdc`}
              </button>
            </div>
            {signature && (
              <p className="fund-foot-note">
                tx{" "}
                <a
                  href={`https://solscan.io/tx/${signature}`}
                  target="_blank"
                  rel="noreferrer"
                  className="dash-btn-link"
                >
                  {signature.slice(0, 8)}…{signature.slice(-8)} ↗
                </a>
              </p>
            )}
          </>
        ) : (
          <div className="fund-mono fund-loading-row">
            waiting for deposit address…
          </div>
        )}

        {error && <div className="fund-error">{error}</div>}

        <button
          type="button"
          className="dash-btn dash-btn-ghost fund-restart"
          onClick={() => {
            setQuote(null);
            setStatus(null);
            setSignature(null);
          }}
        >
          ← new withdrawal
        </button>
      </div>
    );
  }

  // Stage 1: KYC + amount + pix key
  const kycComplete = kyc.name && kyc.taxId && kyc.email;

  return (
    <div className="fund-stage">
      <details className="fund-kyc" open={!kycComplete}>
        <summary className="fund-kyc-summary">
          <span className="fund-kyc-summary-left">
            <span className="fund-mono fund-eyebrow-sm">your details</span>
            <span className="fund-kyc-hint">
              required by brazilian financial regulation · saved on this device
            </span>
          </span>
          <span className="fund-kyc-status">
            {kycComplete ? "✓ saved" : "required"}
          </span>
        </summary>
        <div className="fund-kyc-grid">
          <input
            className="fund-input-text"
            value={kyc.name}
            onChange={(e) => setKyc({ ...kyc, name: e.target.value })}
            placeholder="full name"
          />
          <input
            className="fund-input-text"
            value={kyc.taxId}
            onChange={(e) => setKyc({ ...kyc, taxId: e.target.value })}
            placeholder="CPF (000.000.000-00)"
          />
          <input
            type="email"
            className="fund-input-text"
            value={kyc.email}
            onChange={(e) => setKyc({ ...kyc, email: e.target.value })}
            placeholder="email"
          />
        </div>
      </details>

      <label className="fund-field">
        <span className="fund-mono fund-eyebrow-sm">amount in usdc</span>
        <div className="fund-input-row">
          <span className="fund-prefix">$</span>
          <input
            type="number"
            min="1"
            step="0.01"
            value={amountUsdc}
            onChange={(e) => setAmountUsdc(e.target.value)}
            className="fund-input"
            placeholder="10"
          />
        </div>
      </label>

      <label className="fund-field">
        <span className="fund-mono fund-eyebrow-sm">recipient pix key</span>
        <input
          className="fund-input fund-input-text"
          value={pixKey}
          onChange={(e) => setPixKey(e.target.value)}
          placeholder="cpf, email, phone, or random key"
        />
      </label>

      {previewBrl && (
        <div className="fund-preview">
          recipient receives ≈ <strong>R$ {previewBrl}</strong>{" "}
          <span className="fund-preview-hint">(final in next step)</span>
        </div>
      )}

      {error && <div className="fund-error">{error}</div>}

      <button
        type="button"
        className="dash-btn dash-btn-primary fund-cta"
        disabled={
          !publicKey || amountNum < 1 || !pixKey || !kycComplete || loading
        }
        onClick={submitQuote}
      >
        {loading ? "generating quote…" : "generate quote"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function statusLabelOnramp(s: OnrampStatus | null): string {
  if (!s) return "waiting…";
  const v = s.status?.toLowerCase();
  if (v === "completed") return "done · usdc delivered";
  if (v === "failed") return "failed";
  if (v === "cancelled") return "cancelled";
  if (s.depositStatus?.toLowerCase() === "received")
    return "pix received · sending usdc";
  return "waiting for pix payment";
}

function statusToneOnramp(s: OnrampStatus | null): "wait" | "ok" | "err" {
  const v = s?.status?.toLowerCase();
  if (v === "completed") return "ok";
  if (v === "failed" || v === "cancelled") return "err";
  return "wait";
}

function statusLabelOfframp(s: OfframpStatus | null): string {
  if (!s) return "waiting…";
  const v = s.status?.toLowerCase();
  if (v === "completed") return "done · pix sent";
  if (v === "failed" || v === "refunded") return v;
  if (v === "processing") return "processing · sending pix";
  if (v === "pending") return "waiting for usdc";
  return v || "pending";
}

function statusToneOfframp(s: OfframpStatus | null): "wait" | "ok" | "err" {
  const v = s?.status?.toLowerCase();
  if (v === "completed") return "ok";
  if (v === "failed" || v === "refunded") return "err";
  return "wait";
}

function formatExpiry(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diffMin = Math.max(0, Math.round((d.getTime() - now) / 60000));
    if (diffMin <= 0) return "expired";
    if (diffMin < 60) return `in ${diffMin}m`;
    return `in ${Math.floor(diffMin / 60)}h ${diffMin % 60}m`;
  } catch {
    return "—";
  }
}

const FUND_STYLES = `
  .fund-overlay {
    position: fixed; inset: 0;
    background: rgba(31, 27, 20, 0.55);
    z-index: 60;
    display: flex; align-items: center; justify-content: center;
    padding: 24px;
    opacity: 0; pointer-events: none;
    transition: opacity 200ms ease;
    font-family: var(--font-inter), system-ui, sans-serif;
    color: #1F1B14;
  }
  .fund-overlay-open { opacity: 1; pointer-events: auto; }
  .fund-sheet {
    position: relative;
    width: 100%; max-width: 540px;
    max-height: calc(100vh - 48px);
    background: #FBF6E9;
    border: 1px solid #DCD3BD;
    border-radius: 16px;
    box-shadow: 0 32px 80px -36px rgba(31, 27, 20, 0.55),
                0 4px 12px -6px rgba(31, 27, 20, 0.15);
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .fund-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 16px;
    padding: 28px 32px 16px;
  }
  .fund-title-wrap { display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0; }
  .fund-eyebrow {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10.5px; letter-spacing: 0.2em;
    color: #7A7461; text-transform: uppercase;
  }
  .fund-eyebrow-sm {
    font-size: 10.5px; letter-spacing: 0.18em;
    color: #7A7461; text-transform: uppercase;
  }
  .fund-title {
    font-family: var(--font-instrument-serif), Georgia, serif;
    font-size: 32px; line-height: 1.05; letter-spacing: -0.015em;
    color: #1F1B14; margin: 0; font-weight: 400;
  }
  .fund-sub { font-size: 13px; line-height: 1.5; color: #5A5444; margin: 4px 0 0; max-width: 38ch; }
  .fund-close {
    width: 36px; height: 36px;
    background: transparent; border: 1px solid transparent;
    font-size: 22px; line-height: 1; color: #7A7461;
    cursor: pointer; border-radius: 50%;
    display: inline-flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  }
  .fund-close:hover {
    background: rgba(31, 27, 20, 0.06);
    border-color: rgba(31, 27, 20, 0.08);
    color: #1F1B14;
  }
  .fund-tabs {
    display: flex; gap: 0;
    padding: 0 32px;
    border-bottom: 1px solid #E7DFC9;
  }
  .fund-tab {
    flex: 1;
    background: transparent; border: none;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 12px; letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #7A7461;
    padding: 12px 8px;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: color 160ms ease, border-color 160ms ease;
  }
  .fund-tab:hover { color: #1F1B14; }
  .fund-tab-active { color: #1F1B14; border-bottom-color: #2E5C40; }
  .fund-body {
    padding: 24px 32px 8px;
    overflow-y: auto;
    flex: 1;
  }
  .fund-stage { display: flex; flex-direction: column; gap: 18px; }
  .fund-field { display: flex; flex-direction: column; gap: 8px; }
  .fund-field-label { font-size: 12px; color: #5A5444; }
  .fund-input-row {
    display: flex; align-items: stretch;
    border: 1px solid #DCD3BD;
    border-radius: 6px;
    background: #FFFDF7;
    overflow: hidden;
    transition: border-color 160ms ease, box-shadow 160ms ease;
  }
  .fund-input-row:focus-within { border-color: #2E5C40; box-shadow: 0 0 0 3px rgba(46,92,64,0.1); }
  .fund-prefix {
    display: inline-flex; align-items: center; padding: 0 14px;
    font-family: var(--font-instrument-serif), serif;
    font-size: 22px; color: #5A5444;
    background: #F4EFE3;
    border-right: 1px solid #DCD3BD;
  }
  .fund-input {
    flex: 1;
    border: none; outline: none; background: transparent;
    padding: 14px 16px;
    font-size: 18px;
    font-family: var(--font-inter), sans-serif;
    color: #1F1B14;
  }
  .fund-input-text { padding: 12px 14px; font-size: 14px; border: 1px solid #DCD3BD; border-radius: 6px; background: #FFFDF7; }
  .fund-input-text:focus { outline: none; border-color: #2E5C40; box-shadow: 0 0 0 3px rgba(46,92,64,0.1); }
  .fund-preview {
    font-size: 13px; color: #4A4536;
    background: #F4EFE3;
    border: 1px dashed #DCD3BD;
    border-radius: 8px;
    padding: 12px 14px;
  }
  .fund-preview strong { color: #2E5C40; font-weight: 500; }
  .fund-preview-hint { color: #7A7461; font-size: 11.5px; }
  .fund-cta { padding: 14px 22px; font-size: 14px; justify-content: center; }
  .fund-foot-note { font-size: 11.5px; color: #7A7461; margin: 4px 0 0; line-height: 1.5; }
  .fund-foot-note code { background: rgba(31,27,20,0.05); padding: 1px 6px; border-radius: 3px; font-family: var(--font-jetbrains-mono), monospace; font-size: 11px; }
  .fund-error {
    font-size: 12px; color: #B0473A;
    background: rgba(176,71,58,0.08);
    border: 1px solid rgba(176,71,58,0.25);
    border-radius: 6px;
    padding: 10px 12px;
  }
  .fund-empty { padding: 40px 0; text-align: center; }
  .fund-mono { font-family: var(--font-jetbrains-mono), monospace; font-size: 12px; color: #7A7461; }
  .fund-stage-head {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px;
  }
  .fund-stage-amount {
    font-family: var(--font-instrument-serif), serif;
    font-size: 22px; color: #1F1B14;
    margin-top: 4px;
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  }
  .fund-stage-arrow { color: #7A7461; font-size: 18px; }
  .fund-pill {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10.5px; letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid;
    white-space: nowrap;
  }
  .fund-pill-wait { color: #B8893E; border-color: rgba(184,137,62,0.3); background: rgba(184,137,62,0.08); }
  .fund-pill-ok   { color: #2E5C40; border-color: rgba(46,92,64,0.3);  background: rgba(46,92,64,0.08); }
  .fund-pill-err  { color: #B0473A; border-color: rgba(176,71,58,0.3); background: rgba(176,71,58,0.08); }
  .fund-qr-wrap {
    display: flex; justify-content: center;
    padding: 16px;
    background: #FFFDF7;
    border: 1px solid #E7DFC9;
    border-radius: 12px;
  }
  .fund-qr { width: 240px; height: 240px; image-rendering: pixelated; }
  .fund-copy-row {
    display: flex; align-items: center; gap: 10px;
    background: #FFFDF7;
    border: 1px solid #E7DFC9;
    border-radius: 8px;
    padding: 10px 12px;
  }
  .fund-copy-code {
    flex: 1; min-width: 0;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11.5px; color: #4A4536;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .fund-meta {
    display: grid; grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    padding: 12px 0;
    border-top: 1px dashed #DCD3BD;
    border-bottom: 1px dashed #DCD3BD;
  }
  .fund-meta > div { display: flex; flex-direction: column; gap: 3px; }
  .fund-meta-label {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 9.5px; letter-spacing: 0.18em;
    text-transform: uppercase; color: #7A7461;
  }
  .fund-meta-val { font-size: 12.5px; color: #1F1B14; }
  .fund-meta-mono { font-family: var(--font-jetbrains-mono), monospace; font-size: 11px; }
  .fund-restart { align-self: flex-start; padding: 8px 14px; font-size: 12px; }

  .fund-kyc {
    background: #F4EFE3;
    border: 1px solid #E7DFC9;
    border-radius: 8px;
    padding: 0;
  }
  .fund-kyc-summary {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    cursor: pointer;
    list-style: none;
  }
  .fund-kyc-summary::-webkit-details-marker { display: none; }
  .fund-kyc-summary-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .fund-kyc-hint {
    font-size: 11px; color: #7A7461;
    font-family: var(--font-inter), sans-serif;
    letter-spacing: normal; text-transform: none;
  }
  .fund-kyc-status {
    font-size: 11.5px; color: #2E5C40;
    font-family: var(--font-jetbrains-mono), monospace;
    flex-shrink: 0;
  }
  .fund-kyc[open] .fund-kyc-summary { border-bottom: 1px solid #E7DFC9; }
  .fund-kyc-grid {
    display: flex; flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
  }
  .fund-kyc-grid .fund-input-text {
    padding: 10px 12px;
    font-size: 13px;
  }

  .fund-deposit-card {
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px; flex-wrap: wrap;
    background: #FFFDF7;
    border: 1px solid #E7DFC9;
    border-radius: 10px;
    padding: 14px;
  }
  .fund-deposit-card > div { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
  .fund-deposit-addr {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11.5px; color: #4A4536;
    word-break: break-all;
  }
  .fund-loading-row {
    text-align: center; padding: 20px;
    background: #F4EFE3; border-radius: 8px;
    color: #7A7461;
  }

  .fund-foot {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10.5px; letter-spacing: 0.08em;
    color: #7A7461; text-align: center;
    border-top: 1px dashed #DCD3BD;
    padding: 14px 32px;
  }
  .fund-foot span { color: #2E5C40; font-weight: 500; }

  @media (max-width: 540px) {
    .fund-overlay { padding: 12px; }
    .fund-head, .fund-tabs, .fund-body, .fund-foot { padding-left: 20px; padding-right: 20px; }
    .fund-title { font-size: 26px; }
    .fund-kyc-grid { grid-template-columns: 1fr; }
    .fund-meta { grid-template-columns: 1fr 1fr; }
    .fund-meta > div:last-child { grid-column: 1 / -1; }
  }
`;
