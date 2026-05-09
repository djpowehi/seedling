"use client";

// Top-up-with-Pix flow. Pix → 4P → hot wallet → SPL Token transfer
// to the parent's USDC ATA. The parent then explicitly deposits from
// their balance into a kid's vault via the standard `+ deposit` flow
// on a FamilyCard.
//
// Three phases:
//   1. form     — BRL amount + (CPF + email if not yet stored)
//   2. awaiting — QR + Pix copia-e-cola + polling for credit
//   3. success  — confetti, toast, auto-close
//
// Polls /api/4p/status?customId=... every 5s. Status flips to
// processed=true the moment the webhook signs the SPL Token transfer
// and that tx confirms on-chain.

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { PublicKey } from "@solana/web3.js";

import { celebrateDeposit } from "@/lib/celebrate";
import { useToast } from "@/components/Toast";
import { useLocale } from "@/lib/i18n";
import {
  clearPixProfile,
  formatCpfForDisplay,
  getPixProfile,
  isValidCpf,
  isValidEmail,
  setPixProfile,
} from "@/lib/pixProfile";

// Matches the floor in /api/4p/onramp. Keeping it cheap so test/demo
// runs cost ~$0.20 instead of $1+ per round-trip during development.
// 4P's own minimum on production is R$1.
const MIN_BRL = 1;
const MAX_BRL = 5000;
// 10s instead of 5s — keeps the polling RPC load under Helius free-tier
// rate limits. Pix payments take >10s to confirm anyway, so the slower
// polling doesn't materially delay the user-visible success state.
const POLL_INTERVAL_MS = 10_000;

type Props = {
  parent: PublicKey;
  onCredited: () => void;
  onCancel: () => void;
};

interface OnrampOk {
  txid: string;
  pixCopiaECola: string;
  customId: string;
  expiresInSeconds: number;
  createdAt: string;
}

export function PixDepositForm({ parent, onCredited, onCancel }: Props) {
  const { showToast } = useToast();
  const { t, locale } = useLocale();
  // Single ref shared by both the form (phase=form) and the awaiting div
  // (phase=awaiting). Used only for the confetti origin compute, which
  // only needs getBoundingClientRect — works on any HTMLElement.
  const containerRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const parentKey = parent.toBase58();

  const [phase, setPhase] = useState<"form" | "awaiting" | "success">("form");

  // Saved profile (loaded after mount; SSR-safe).
  const [storedProfile, setStoredProfile] = useState<{
    cpf: string;
    email: string;
  } | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);

  // Form fields
  const [amountInput, setAmountInput] = useState("");
  const [cpfInput, setCpfInput] = useState("");
  const [emailInput, setEmailInput] = useState("");

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Awaiting state
  const [order, setOrder] = useState<OnrampOk | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [copied, setCopied] = useState(false);

  // Hydrate profile from localStorage on mount.
  useEffect(() => {
    const p = getPixProfile(parentKey);
    if (p) {
      setStoredProfile(p);
    } else {
      setEditingProfile(true);
    }
  }, [parentKey]);

  const hasProfile = storedProfile !== null && !editingProfile;
  const cpfForRequest = hasProfile ? storedProfile.cpf : cpfInput;
  const emailForRequest = hasProfile ? storedProfile.email : emailInput;

  const amountNum = parseFloat(amountInput);
  let amountError: string | null = null;
  if (!amountInput.trim()) {
    amountError = null;
  } else if (Number.isNaN(amountNum) || !Number.isFinite(amountNum)) {
    amountError = t("pix.amount.error.number");
  } else if (amountNum < MIN_BRL) {
    amountError = t("pix.amount.error.min", { min: MIN_BRL });
  } else if (amountNum > MAX_BRL) {
    amountError = t("pix.amount.error.max", { max: MAX_BRL.toLocaleString() });
  }

  const profileError = (() => {
    if (hasProfile) return null;
    if (cpfInput && !isValidCpf(cpfInput)) return t("pix.profile.error.cpf");
    if (emailInput && !isValidEmail(emailInput))
      return t("pix.profile.error.email");
    return null;
  })();

  const submitDisabled =
    submitting ||
    !amountInput.trim() ||
    amountError !== null ||
    profileError !== null ||
    (!hasProfile && (!isValidCpf(cpfInput) || !isValidEmail(emailInput)));

  // Render QR when an order arrives.
  useEffect(() => {
    if (phase !== "awaiting" || !order || !canvasRef.current) return;
    // Smaller QR — secondary affordance now that copy-paste is primary.
    QRCode.toCanvas(canvasRef.current, order.pixCopiaECola, {
      width: 140,
      margin: 1,
      color: { dark: "#1F3A2A", light: "#FBF8F2" },
    }).catch(() => {
      /* swallow — copy-paste fallback still works */
    });
  }, [phase, order]);

  // Countdown.
  useEffect(() => {
    if (phase !== "awaiting" || !order) return;
    setSecondsLeft(order.expiresInSeconds);
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, order]);

  // Poll for credit completion.
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
          const origin = computeOrigin(containerRef.current);
          void celebrateDeposit(origin);
          showToast({
            variant: "monthly",
            title: t("pix.deposit.toast.title"),
            countUpUsd: amountNum, // BRL value displayed as $; close enough for the moment
            subtitle: t("pix.deposit.toast.subtitle"),
          });
          // Brief beat so the user reads the success state, then close.
          setTimeout(() => onCredited(), 1500);
        }
      } catch {
        // Transient — retry next tick.
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [phase, order, amountNum, showToast, onCredited]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled) return;

    setSubmitting(true);
    setSubmitError(null);

    // Persist the profile only AFTER 4P accepts the order — otherwise
    // an invalid CPF gets stuck in localStorage on the user's device.
    try {
      const res = await fetch("/api/4p/onramp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "parent",
          parent: parent.toBase58(),
          amountBrl: amountNum,
          cpf: cpfForRequest.replace(/\D/g, ""),
          email: emailForRequest,
        }),
      });
      const json = (await res.json()) as OnrampOk | { error: string };

      if (!res.ok || "error" in json) {
        const msg = "error" in json ? json.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      // Success — save profile if it was newly entered.
      if (!hasProfile) {
        setPixProfile(parentKey, {
          cpf: cpfInput.replace(/\D/g, ""),
          email: emailInput,
        });
        setStoredProfile({
          cpf: cpfInput.replace(/\D/g, ""),
          email: emailInput,
        });
        setEditingProfile(false);
      }

      setOrder(json);
      setPhase("awaiting");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Common: 4P returns "Not authorized. Incorrect Api Key." when
      // the key isn't activated yet. Translate to something parent-friendly.
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
      // older browsers — silent
    }
  };

  // ---- render ----

  if (phase === "success") {
    return (
      <div className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-4 flex flex-col items-center gap-2">
        <span className="text-2xl">✅</span>
        <span className="text-sm font-medium text-emerald-900">
          {t("pix.success.title")}
        </span>
        <span className="text-xs text-stone-500">
          {t("pix.success.closing")}
        </span>
      </div>
    );
  }

  if (phase === "awaiting" && order) {
    return (
      <div
        ref={containerRef as React.RefObject<HTMLDivElement>}
        className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-4 flex flex-col gap-4"
      >
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-medium text-emerald-900">
            {t("pix.awaiting.title", { amount: amountNum.toFixed(2) })}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-stone-500 hover:text-stone-700"
          >
            {t("pix.cancel")}
          </button>
        </div>

        {/* Copy-paste code — primary action. Mobile-first reality for BR
            Pix payments: ~85% mobile-to-mobile, where QR-scanning is
            impossible. Code + big Copy button matches iFood / Mercado Pago. */}
        <div className="flex flex-col gap-2">
          <span className="text-xs text-stone-600">
            {t("pix.awaiting.paste_label")}
          </span>
          <input
            readOnly
            value={order.pixCopiaECola}
            className="rounded-lg border border-stone-300 px-3 py-2 text-xs font-mono bg-white"
            onClick={(e) => e.currentTarget.select()}
          />
          <button
            type="button"
            onClick={handleCopy}
            className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-800 transition-colors"
          >
            {copied
              ? t("pix.awaiting.copied_button")
              : `📋 ${t("pix.awaiting.copy_button")}`}
          </button>
        </div>

        {/* Step-by-step instructions. Brazilian users recognize this from
            iFood/Mercado Pago and know exactly what to do. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-stone-700">
            {t("pix.awaiting.how_to_title")}
          </span>
          <ol className="text-xs text-stone-600 space-y-1 pl-4 list-decimal">
            <li>{t("pix.awaiting.step_1")}</li>
            <li>{t("pix.awaiting.step_2")}</li>
            <li>{t("pix.awaiting.step_3")}</li>
          </ol>
        </div>

        {/* QR de-emphasized — secondary path for desktop-to-mobile or
            "show this screen to grandma" cases. */}
        <div className="flex flex-col items-center gap-2 pt-2 border-t border-stone-200">
          <span className="text-[10px] uppercase tracking-wider text-stone-400">
            {t("pix.awaiting.or_qr")}
          </span>
          <canvas ref={canvasRef} style={{ width: 140, height: 140 }} />
        </div>

        <div className="flex items-center justify-between text-xs text-stone-500">
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
      </div>
    );
  }

  return (
    <form
      ref={containerRef as React.RefObject<HTMLFormElement>}
      onSubmit={handleSubmit}
      className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-4 flex flex-col gap-3"
    >
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-emerald-900">
          {t("pix.deposit.title")}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-stone-500 hover:text-stone-700"
        >
          {t("pix.cancel")}
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-stone-500">{t("pix.amount.brl")}</span>
        <div className="flex items-center gap-2">
          <span className="text-stone-500">R$</span>
          <input
            type="number"
            min={MIN_BRL}
            max={MAX_BRL}
            step="0.01"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder={t("pix.amount.placeholder")}
            className="rounded-lg border border-stone-300 px-3 py-2 text-sm w-32 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            autoFocus
          />
        </div>
        {amountError && (
          <span className="text-xs text-red-700">{amountError}</span>
        )}
      </div>

      {hasProfile ? (
        <div className="flex items-center justify-between text-xs text-stone-600 rounded-lg border border-stone-200 bg-white px-3 py-2">
          <span>
            {t("pix.profile.paying_as", {
              cpf: formatCpfForDisplay(storedProfile.cpf),
              email: storedProfile.email,
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              clearPixProfile(parentKey);
              setStoredProfile(null);
              setCpfInput("");
              setEmailInput("");
              setEditingProfile(true);
            }}
            className="text-stone-500 hover:text-stone-800 underline"
          >
            {t("pix.profile.change")}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-stone-500">
              {t("pix.profile.cpf")}
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={cpfInput}
              onChange={(e) => setCpfInput(e.target.value)}
              placeholder={t("pix.profile.cpf.placeholder")}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-stone-500">
              {t("pix.profile.email")}
            </span>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder={t("pix.profile.email.placeholder")}
              className="rounded-lg border border-stone-300 px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          {profileError && (
            <span className="text-xs text-red-700">{profileError}</span>
          )}
          <span className="text-[11px] text-stone-500">
            {t("pix.profile.fine")}
          </span>
        </>
      )}

      {submitError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800">
          {submitError}
        </div>
      )}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={submitDisabled}
          className="rounded-full bg-lime-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-lime-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? t("pix.submit.generating") : t("pix.submit.generate")}
        </button>
      </div>
    </form>
  );
}

function computeOrigin(el: HTMLElement | null): { x: number; y: number } {
  if (!el || typeof window === "undefined") return { x: 0.5, y: 0.4 };
  const r = el.getBoundingClientRect();
  return {
    x: (r.left + r.width / 2) / window.innerWidth,
    y: (r.top + r.height * 0.3) / window.innerHeight,
  };
}
