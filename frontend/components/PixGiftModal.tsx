"use client";

// Pix-only gift flow for non-crypto gifters. The kid view's existing
// GiftModal handles Solana-wallet gifts (Phantom/Solflare scan); this
// is the parallel path for grandma in Brazil who has BRL + a Pix app
// and zero crypto setup.
//
// End state is identical to the Solana flow: a deposit instruction
// credits the family on-chain. The differences are pre-deposit:
//   - 4P collects the BRL via Pix
//   - 4P swaps to USDC and sends to our hot wallet
//   - The webhook signs the deposit ix on the gifter's behalf,
//     prepending a `seedling-gift:<name>` memo so the gift wall picks
//     it up exactly like a Solana-Pay gift
//
// Same three-phase pattern as PixDepositForm.

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { useLocale } from "@/lib/i18n";

const MIN_BRL = 5;
const MAX_BRL = 5000;
const POLL_INTERVAL_MS = 5_000;
const PRESETS_BRL = [25, 50, 100, 250] as const;

type Props = {
  familyPda: string;
  kidName: string | null;
  open: boolean;
  onClose: () => void;
};

interface OnrampOk {
  txid: string;
  pixCopiaECola: string;
  customId: string;
  expiresInSeconds: number;
  createdAt: string;
}

function isValidCpf(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;
  const calcCheck = (slice: string, weightStart: number) => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * (weightStart - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  if (calcCheck(digits.slice(0, 9), 10) !== Number(digits[9])) return false;
  if (calcCheck(digits.slice(0, 10), 11) !== Number(digits[10])) return false;
  return true;
}

function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

export function PixGiftModal({ familyPda, kidName, open, onClose }: Props) {
  const { t } = useLocale();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] = useState<"form" | "awaiting" | "success">("form");

  const [amountBrl, setAmountBrl] = useState<number>(50);
  const [customDraft, setCustomDraft] = useState("");
  const [fromName, setFromName] = useState("");
  const [cpfInput, setCpfInput] = useState("");
  const [emailInput, setEmailInput] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [order, setOrder] = useState<OnrampOk | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);

  // Reset internal state every time the modal opens — gifters are
  // typically one-shot users, no point persisting their fields.
  useEffect(() => {
    if (open) {
      setPhase("form");
      setAmountBrl(50);
      setCustomDraft("");
      setFromName("");
      setCpfInput("");
      setEmailInput("");
      setSubmitError(null);
      setOrder(null);
    }
  }, [open]);

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

  // Render QR.
  useEffect(() => {
    if (phase !== "awaiting" || !order || !canvasRef.current) return;
    // Smaller QR — secondary affordance (de-emphasized below the primary
    // copy-paste flow that matches iFood/Mercado Pago patterns).
    QRCode.toCanvas(canvasRef.current, order.pixCopiaECola, {
      width: 130,
      margin: 1,
      color: { dark: "#1F3A2A", light: "#FBF8F2" },
    }).catch(() => {
      /* swallow */
    });
  }, [phase, order]);

  // Countdown.
  useEffect(() => {
    if (phase !== "awaiting" || !order) return;
    setSecondsLeft(order.expiresInSeconds);
    const interval = setInterval(
      () => setSecondsLeft((s) => Math.max(0, s - 1)),
      1000
    );
    return () => clearInterval(interval);
  }, [phase, order]);

  // Poll status.
  useEffect(() => {
    if (phase !== "awaiting" || !order) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/4p/status?customId=${encodeURIComponent(order.customId)}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as { processed?: boolean };
        if (!cancelled && json.processed) {
          setPhase("success");
        }
      } catch {
        /* retry next tick */
      }
    };
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase, order]);

  if (!open) return null;

  const formError =
    cpfInput && !isValidCpf(cpfInput)
      ? t("pix.profile.error.cpf")
      : emailInput && !isValidEmail(emailInput)
      ? t("pix.profile.error.email")
      : amountBrl < MIN_BRL
      ? t("pix.amount.error.min", { min: MIN_BRL })
      : amountBrl > MAX_BRL
      ? t("pix.amount.error.max", { max: MAX_BRL.toLocaleString() })
      : null;

  const submitDisabled =
    submitting ||
    !isValidCpf(cpfInput) ||
    !isValidEmail(emailInput) ||
    amountBrl < MIN_BRL ||
    amountBrl > MAX_BRL;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/4p/onramp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "gift",
          familyPda,
          amountBrl,
          cpf: cpfInput.replace(/\D/g, ""),
          email: emailInput,
          gifterName: fromName.trim() || undefined,
        }),
      });
      const json = (await res.json()) as OnrampOk | { error: string };
      if (!res.ok || "error" in json) {
        const msg = "error" in json ? json.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }
      setOrder(json);
      setPhase("awaiting");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("not authorized") || msg.includes("Incorrect Api")) {
        setSubmitError(t("pix.error.not_authorized"));
      } else {
        setSubmitError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!order) return;
    try {
      await navigator.clipboard.writeText(order.pixCopiaECola);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* silent */
    }
  };

  const greetingName = kidName ?? "this family";

  return (
    <div className="pgm-overlay" onClick={onClose}>
      <style dangerouslySetInnerHTML={{ __html: PIX_GIFT_STYLES }} />
      <div className="pgm-sheet" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="pgm-close"
          onClick={onClose}
          aria-label="close"
        >
          ×
        </button>

        <div className="pgm-eyebrow">{t("pix.gift.eyebrow")}</div>
        <h2 className="pgm-title">
          {(() => {
            // Split the localized title on {name} so the dynamic kid name
            // can render italicized while the surrounding copy stays
            // upright + locale-aware.
            const tpl = t("pix.gift.title");
            const [pre = "", post = ""] = tpl.split("{name}");
            return (
              <>
                {pre}
                <em>{greetingName}</em>
                {post}
              </>
            );
          })()}
        </h2>

        {phase === "success" ? (
          <div className="pgm-success">
            <div className="pgm-success-mark">✓</div>
            <div className="pgm-success-title">
              {t("pix.gift.success.title")}
            </div>
            <p className="pgm-success-sub">
              {t("pix.gift.success.body", {
                name: kidName ?? t("pix.gift.this_family"),
              })}
            </p>
            <button type="button" className="pgm-close-btn" onClick={onClose}>
              {t("pix.gift.success.close")}
            </button>
          </div>
        ) : phase === "awaiting" && order ? (
          <>
            <div className="pgm-paste-block">
              <span className="pgm-paste-label">
                {t("pix.awaiting.paste_label")}
              </span>
              <input
                readOnly
                className="pgm-pix-input"
                value={order.pixCopiaECola}
                onClick={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                className="pgm-copy-big"
                onClick={handleCopy}
              >
                {copied
                  ? t("pix.awaiting.copied_button")
                  : `📋 ${t("pix.awaiting.copy_button")}`}
              </button>
            </div>

            <div className="pgm-howto">
              <span className="pgm-howto-title">
                {t("pix.awaiting.how_to_title")}
              </span>
              <ol className="pgm-howto-list">
                <li>{t("pix.awaiting.step_1")}</li>
                <li>{t("pix.awaiting.step_2")}</li>
                <li>{t("pix.awaiting.step_3")}</li>
              </ol>
            </div>

            <div className="pgm-qr-section">
              <span className="pgm-qr-label">{t("pix.awaiting.or_qr")}</span>
              <div className="pgm-qr-frame pgm-qr-frame-small">
                <canvas ref={canvasRef} className="pgm-qr-small" />
              </div>
            </div>

            <div className="pgm-status">
              <span>
                {secondsLeft > 0
                  ? t("pix.awaiting.waiting")
                  : t("pix.awaiting.expired")}
              </span>
              {secondsLeft > 0 && (
                <span>
                  {t("pix.awaiting.expires_in", {
                    minutes: Math.floor(secondsLeft / 60),
                    seconds: secondsLeft % 60,
                  })}
                </span>
              )}
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="pgm-form">
            <p className="pgm-sub">{t("pix.gift.body")}</p>

            <label className="pgm-row">
              <span className="pgm-label">{t("pix.gift.your_name")}</span>
              <input
                type="text"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder={t("pix.gift.your_name.placeholder")}
                maxLength={32}
                className="pgm-input pgm-name-input"
              />
            </label>

            <div className="pgm-row">
              <span className="pgm-label">{t("pix.gift.amount")}</span>
              <div className="pgm-amount-row">
                {PRESETS_BRL.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`pgm-chip ${
                      amountBrl === p ? "pgm-chip-on" : ""
                    }`}
                    onClick={() => {
                      setAmountBrl(p);
                      setCustomDraft("");
                    }}
                  >
                    R${p}
                  </button>
                ))}
                <input
                  type="number"
                  inputMode="numeric"
                  placeholder={t("pix.gift.amount.custom")}
                  className="pgm-custom"
                  min={MIN_BRL}
                  max={MAX_BRL}
                  value={customDraft}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setCustomDraft(raw);
                    const n = Number(raw);
                    if (Number.isFinite(n) && n > 0) setAmountBrl(n);
                  }}
                />
              </div>
            </div>

            <label className="pgm-row">
              <span className="pgm-label">{t("pix.profile.cpf")}</span>
              <input
                type="text"
                inputMode="numeric"
                value={cpfInput}
                onChange={(e) => setCpfInput(e.target.value)}
                placeholder={t("pix.profile.cpf.placeholder")}
                className="pgm-input"
              />
            </label>

            <label className="pgm-row">
              <span className="pgm-label">{t("pix.profile.email")}</span>
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder={t("pix.profile.email.placeholder")}
                className="pgm-input"
              />
            </label>

            <p className="pgm-fine">{t("pix.gift.fine")}</p>

            {formError && <div className="pgm-error">{formError}</div>}
            {submitError && <div className="pgm-error">{submitError}</div>}

            <button
              type="submit"
              disabled={submitDisabled}
              className="pgm-submit"
            >
              {submitting
                ? t("pix.gift.submitting")
                : t("pix.gift.submit", { amount: amountBrl })}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const PIX_GIFT_STYLES = `
  .pgm-overlay {
    position: fixed; inset: 0;
    background: rgba(31, 58, 42, 0.45);
    display: flex; align-items: flex-end; justify-content: center;
    z-index: 50; animation: pgm-fade 200ms ease-out;
  }
  @keyframes pgm-fade { from { opacity: 0; } to { opacity: 1; } }

  .pgm-sheet {
    position: relative;
    background: #FBF8F2;
    width: 100%; max-width: 480px;
    border-radius: 24px 24px 0 0;
    padding: 22px 24px 32px;
    display: flex; flex-direction: column; gap: 12px;
    animation: pgm-slide 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
    box-shadow: 0 -20px 60px rgba(31, 58, 42, 0.18);
    max-height: 92vh; overflow-y: auto;
  }
  @keyframes pgm-slide {
    from { transform: translateY(20px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }
  @media (min-width: 540px) {
    .pgm-overlay { align-items: center; }
    .pgm-sheet { border-radius: 24px; max-width: 460px; }
  }

  .pgm-close {
    position: absolute; top: 12px; right: 16px;
    width: 32px; height: 32px;
    border: none; background: transparent;
    font-size: 28px; line-height: 1; color: #6F6A58;
    cursor: pointer; border-radius: 50%;
  }
  .pgm-close:hover { background: #ECE4D2; color: #2A2A22; }

  .pgm-eyebrow {
    font-family: var(--font-jetbrains-mono), ui-monospace, monospace;
    font-size: 11px; letter-spacing: 0.18em;
    text-transform: uppercase; color: #6F6A58;
  }
  .pgm-title {
    font-family: var(--font-instrument-serif), Georgia, serif;
    font-weight: 400; font-size: 32px;
    line-height: 1.1; letter-spacing: -0.01em;
    color: #1F3A2A; margin: 0;
  }
  .pgm-title em { font-style: italic; color: #2E5C40; }
  .pgm-sub {
    font-family: var(--font-inter), -apple-system, sans-serif;
    font-size: 14px; line-height: 1.5;
    color: #6F6A58; margin: 0;
  }

  .pgm-form { display: flex; flex-direction: column; gap: 14px; margin-top: 4px; }

  .pgm-row { display: flex; flex-direction: column; gap: 6px; }
  .pgm-label {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10.5px; letter-spacing: 0.16em;
    text-transform: uppercase; color: #6F6A58;
  }
  .pgm-input {
    font-family: var(--font-inter), sans-serif;
    padding: 10px 14px; font-size: 14px;
    border: 1px solid #D9CFB8; border-radius: 12px;
    background: #FBF8F2; color: #1F3A2A;
    outline: none; transition: border-color 140ms ease;
  }
  .pgm-input:focus { border-color: #2E5C40; }
  .pgm-name-input {
    font-family: var(--font-instrument-serif), Georgia, serif;
    font-size: 18px;
  }
  .pgm-name-input::placeholder { color: #B8AC8E; font-style: italic; }

  .pgm-amount-row { display: flex; gap: 8px; flex-wrap: wrap; }
  .pgm-chip {
    font-family: var(--font-jetbrains-mono), monospace;
    padding: 8px 14px; border: 1px solid #D9CFB8;
    border-radius: 99px; background: #FBF8F2;
    color: #2A2A22; cursor: pointer; font-size: 13px;
    letter-spacing: 0.02em; transition: all 140ms ease;
  }
  .pgm-chip:hover { border-color: #2E5C40; }
  .pgm-chip-on { background: #2E5C40; color: #FBF8F2; border-color: #2E5C40; }
  .pgm-custom {
    font-family: var(--font-jetbrains-mono), monospace;
    flex: 1; min-width: 80px; padding: 8px 14px;
    border: 1px solid #D9CFB8; border-radius: 99px;
    background: #FBF8F2; color: #2A2A22; font-size: 13px; outline: none;
  }
  .pgm-custom:focus { border-color: #2E5C40; }

  .pgm-fine {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10.5px; color: #8A8169;
    margin: 0; line-height: 1.45;
  }

  .pgm-error {
    padding: 10px 12px;
    background: rgba(176, 71, 58, 0.08);
    border: 1px solid rgba(176, 71, 58, 0.25);
    border-radius: 8px;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11.5px; color: #B0473A;
    line-height: 1.45; word-break: break-word;
  }

  .pgm-submit {
    margin-top: 4px;
    padding: 14px 16px;
    background: #2E5C40; color: #FBF8F2;
    border: 1px solid #2E5C40; border-radius: 12px;
    font-family: var(--font-instrument-serif), Georgia, serif;
    font-size: 18px; cursor: pointer;
    letter-spacing: 0.005em;
    transition: background 140ms ease;
  }
  .pgm-submit:hover:not(:disabled) { background: #244A33; }
  .pgm-submit:disabled { opacity: 0.55; cursor: default; }

  .pgm-qr-frame {
    align-self: center; padding: 14px;
    background: #FBF8F2; border: 1px solid #ECE4D2;
    border-radius: 16px; margin-top: 6px;
  }
  .pgm-qr { display: block; width: 220px; height: 220px; }

  .pgm-pix-row { display: flex; gap: 8px; align-items: center; }
  .pgm-pix-input {
    width: 100%;
    padding: 10px 12px;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px; color: #2A2A22;
    border: 1px solid #D9CFB8; border-radius: 10px;
    background: #FBF8F2; outline: none;
    box-sizing: border-box;
  }
  .pgm-copy-btn {
    padding: 10px 14px;
    background: #FBF8F2; color: #2A2A22;
    border: 1px solid #D9CFB8; border-radius: 99px;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 12px; cursor: pointer;
    transition: all 140ms ease;
  }
  .pgm-copy-btn:hover { border-color: #2E5C40; color: #2E5C40; }

  /* iFood-style awaiting layout: code + big copy primary, steps,
   * de-emphasized QR. */
  .pgm-paste-block {
    display: flex; flex-direction: column; gap: 10px;
    margin-top: 4px;
  }
  .pgm-paste-label {
    font-family: var(--font-inter), sans-serif;
    font-size: 13px; color: #4A4A3F; line-height: 1.4;
  }
  .pgm-copy-big {
    width: 100%;
    padding: 14px 16px;
    background: #2E5C40; color: #FBF8F2;
    border: none; border-radius: 12px;
    font-family: var(--font-instrument-serif), Georgia, serif;
    font-size: 17px; cursor: pointer;
    letter-spacing: 0.005em;
    transition: background 140ms ease;
  }
  .pgm-copy-big:hover { background: #244A33; }

  .pgm-howto {
    display: flex; flex-direction: column; gap: 6px;
    padding: 12px 14px;
    background: #FBF8F2;
    border: 1px solid #ECE4D2; border-radius: 10px;
  }
  .pgm-howto-title {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px; letter-spacing: 0.12em;
    text-transform: uppercase; color: #6F6A58;
  }
  .pgm-howto-list {
    margin: 0; padding-left: 20px;
    font-family: var(--font-inter), sans-serif;
    font-size: 13px; color: #2A2A22; line-height: 1.6;
    display: flex; flex-direction: column; gap: 2px;
  }

  .pgm-qr-section {
    display: flex; flex-direction: column;
    align-items: center; gap: 8px;
    padding-top: 14px;
    border-top: 1px solid #ECE4D2;
  }
  .pgm-qr-label {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10px; letter-spacing: 0.16em;
    text-transform: uppercase; color: #8A8169;
  }
  .pgm-qr-frame-small { padding: 8px; margin-top: 0; }
  .pgm-qr-small { display: block; width: 130px; height: 130px; }

  .pgm-status {
    display: flex; justify-content: space-between;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px; color: #6F6A58;
    margin-top: 6px;
  }

  .pgm-success {
    display: flex; flex-direction: column;
    align-items: center; text-align: center;
    gap: 12px; padding: 16px 0;
  }
  .pgm-success-mark {
    width: 56px; height: 56px;
    border-radius: 50%;
    background: #2E5C40; color: #FBF8F2;
    display: flex; align-items: center; justify-content: center;
    font-size: 28px; line-height: 1;
  }
  .pgm-success-title {
    font-family: var(--font-instrument-serif), Georgia, serif;
    font-size: 22px; color: #1F3A2A;
  }
  .pgm-success-sub {
    font-family: var(--font-inter), sans-serif;
    font-size: 13px; color: #6F6A58;
    line-height: 1.5; margin: 0; max-width: 360px;
  }
  .pgm-close-btn {
    margin-top: 8px;
    padding: 10px 22px;
    background: #FBF8F2; color: #2A2A22;
    border: 1px solid #D9CFB8; border-radius: 99px;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 12px; cursor: pointer;
    letter-spacing: 0.04em;
  }
  .pgm-close-btn:hover { border-color: #2E5C40; color: #2E5C40; }
`;
