"use client";

// Waitlist landing — demand test with zero custody.
//
// New route at /waitlist that captures intent without taking deposits.
// Five questions, no wallet connection, no Privy gate. Designed so it
// can light up on Jun 23 evening (alongside the option-b seeker push)
// and start collecting LOIs immediately. Storage is decoupled: the
// endpoint POSTs to whatever WAITLIST_WEBHOOK_URL is set to (Zapier,
// Slack, Notion, a custom n8n flow) — set it before deploy, otherwise
// the endpoint just logs to console and the entry is lost.

import Link from "next/link";
import { useState } from "react";
import { LocaleToggle } from "@/components/LocaleToggle";
import { useLocale } from "@/lib/i18n";

const STYLES = `
  .wl-root {
    --stone-50:  #FBF8F2;
    --stone-100: #F5F0E6;
    --stone-200: #ECE4D2;
    --stone-300: #D9CFB8;
    --stone-500: #8A8169;
    --ink:       #2A2A22;
    --ink-soft:  #4A4A3F;
    --ink-muted: #6F6A58;
    --green-900: #1F3A2A;
    --green-700: #2E5C40;
    --green-600: #3A7050;
    --green-500: #4A8A65;
    --green-100: #DFE8DD;
    --red-700: #9B3838;
    --serif: var(--font-instrument-serif), 'Iowan Old Style', Georgia, serif;
    --sans:  var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif;
    --mono:  var(--font-jetbrains-mono), ui-monospace, monospace;
    --max: 720px;
    background: var(--stone-50);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 16px;
    line-height: 1.55;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .wl-root *, .wl-root *::before, .wl-root *::after { box-sizing: border-box; }
  .wl-top {
    max-width: var(--max);
    margin: 0 auto;
    padding: 28px 24px 0 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .wl-brand {
    font-family: var(--serif);
    font-size: 22px;
    color: var(--green-900);
    text-decoration: none;
    letter-spacing: -0.01em;
  }
  .wl-container {
    max-width: var(--max);
    margin: 0 auto;
    padding: 48px 24px 96px 24px;
  }
  .wl-eyebrow {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--green-700);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 16px;
  }
  .wl-h1 {
    font-family: var(--serif);
    font-size: 44px;
    line-height: 1.05;
    letter-spacing: -0.02em;
    margin: 0 0 16px 0;
    color: var(--green-900);
  }
  .wl-h1 em { font-style: italic; }
  .wl-sub {
    font-size: 17px;
    color: var(--ink-soft);
    margin: 0 0 36px 0;
    max-width: 580px;
  }
  .wl-card {
    background: #fff;
    border: 1px solid var(--stone-200);
    border-radius: 16px;
    padding: 28px;
  }
  .wl-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 18px;
  }
  .wl-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .wl-hint {
    font-size: 12px;
    color: var(--ink-muted);
    margin-top: 2px;
  }
  .wl-input, .wl-select, .wl-textarea {
    font-family: var(--sans);
    font-size: 15px;
    padding: 10px 12px;
    border: 1px solid var(--stone-300);
    border-radius: 8px;
    background: var(--stone-50);
    color: var(--ink);
    outline: none;
    transition: border-color 120ms;
  }
  .wl-input:focus, .wl-select:focus, .wl-textarea:focus {
    border-color: var(--green-500);
  }
  .wl-textarea {
    min-height: 88px;
    resize: vertical;
    font-family: var(--sans);
  }
  .wl-error {
    color: var(--red-700);
    font-size: 12px;
    margin-top: 2px;
  }
  .wl-submit {
    background: var(--green-700);
    color: #fff;
    font-family: var(--sans);
    font-size: 15px;
    font-weight: 600;
    padding: 12px 24px;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    transition: background 120ms;
    margin-top: 8px;
  }
  .wl-submit:hover:not(:disabled) { background: var(--green-900); }
  .wl-submit:disabled {
    background: var(--stone-300);
    cursor: not-allowed;
  }
  .wl-success {
    background: var(--green-100);
    border: 1px solid var(--green-500);
    border-radius: 12px;
    padding: 24px;
    text-align: center;
  }
  .wl-success-title {
    font-family: var(--serif);
    font-size: 24px;
    color: var(--green-900);
    margin: 0 0 8px 0;
  }
  .wl-success-body {
    font-size: 15px;
    color: var(--ink-soft);
    margin: 0;
  }
  .wl-fineprint {
    font-size: 12px;
    color: var(--ink-muted);
    margin-top: 24px;
    line-height: 1.5;
  }
  @media (max-width: 540px) {
    .wl-h1 { font-size: 34px; }
    .wl-container { padding: 32px 18px 64px 18px; }
    .wl-card { padding: 20px; }
  }
`;

type FormState = {
  email: string;
  country: string;
  depositUsd: string;
  kidAge: string;
  note: string;
};

// ISO-style codes keyed off the EN/PT-BR translation maps below. We store
// the code in the form value (stable, machine-readable) but display the
// locale-appropriate label. Submitting "US" instead of "United States"
// keeps the downstream webhook clean regardless of which locale the
// parent used.
const COUNTRY_CODES = [
  "US",
  "BR",
  "CA",
  "GB",
  "DE",
  "FR",
  "ES",
  "PT",
  "MX",
  "AR",
  "CO",
  "CL",
  "JP",
  "SG",
  "AU",
  "OTHER",
];

const COUNTRY_LABELS: Record<"en" | "pt-BR", Record<string, string>> = {
  en: {
    US: "United States",
    BR: "Brazil",
    CA: "Canada",
    GB: "United Kingdom",
    DE: "Germany",
    FR: "France",
    ES: "Spain",
    PT: "Portugal",
    MX: "Mexico",
    AR: "Argentina",
    CO: "Colombia",
    CL: "Chile",
    JP: "Japan",
    SG: "Singapore",
    AU: "Australia",
    OTHER: "Other",
  },
  "pt-BR": {
    US: "Estados Unidos",
    BR: "Brasil",
    CA: "Canadá",
    GB: "Reino Unido",
    DE: "Alemanha",
    FR: "França",
    ES: "Espanha",
    PT: "Portugal",
    MX: "México",
    AR: "Argentina",
    CO: "Colômbia",
    CL: "Chile",
    JP: "Japão",
    SG: "Singapura",
    AU: "Austrália",
    OTHER: "Outro",
  },
};

export default function WaitlistPage() {
  const { t, locale } = useLocale();
  const countryLabels = COUNTRY_LABELS[locale];
  const [form, setForm] = useState<FormState>({
    email: "",
    country: "",
    depositUsd: "",
    kidAge: "",
    note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const validDeposit =
    form.depositUsd.trim() === "" ||
    (!Number.isNaN(parseFloat(form.depositUsd)) &&
      parseFloat(form.depositUsd) >= 0);
  const validKidAge =
    form.kidAge.trim() === "" ||
    (!Number.isNaN(parseInt(form.kidAge, 10)) &&
      parseInt(form.kidAge, 10) >= 0 &&
      parseInt(form.kidAge, 10) <= 25);

  const canSubmit =
    validEmail &&
    form.country !== "" &&
    form.depositUsd.trim() !== "" &&
    validDeposit &&
    form.kidAge.trim() !== "" &&
    validKidAge;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          country: form.country,
          depositUsd: parseFloat(form.depositUsd),
          kidAge: parseInt(form.kidAge, 10),
          note: form.note.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="wl-root">
      <style>{STYLES}</style>

      <div className="wl-top">
        <Link href="/" className="wl-brand">
          Seedling
        </Link>
        <LocaleToggle />
      </div>

      <div className="wl-container">
        <div className="wl-eyebrow">{t("waitlist.eyebrow")}</div>
        <h1 className="wl-h1">{t("waitlist.title")}</h1>
        <p className="wl-sub">{t("waitlist.sub")}</p>

        {done ? (
          <div className="wl-success">
            <h2 className="wl-success-title">{t("waitlist.success.title")}</h2>
            <p className="wl-success-body">{t("waitlist.success.body")}</p>
          </div>
        ) : (
          <form className="wl-card" onSubmit={handleSubmit} noValidate>
            <div className="wl-field">
              <label className="wl-label" htmlFor="wl-email">
                {t("waitlist.field.email")}
              </label>
              <input
                id="wl-email"
                className="wl-input"
                type="email"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                required
                autoComplete="email"
              />
              {form.email.length > 0 && !validEmail && (
                <span className="wl-error">{t("waitlist.error.email")}</span>
              )}
            </div>

            <div className="wl-field">
              <label className="wl-label" htmlFor="wl-country">
                {t("waitlist.field.country")}
              </label>
              <select
                id="wl-country"
                className="wl-select"
                value={form.country}
                onChange={(e) => update("country", e.target.value)}
                required
              >
                <option value="">—</option>
                {COUNTRY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {countryLabels[code] ?? code}
                  </option>
                ))}
              </select>
            </div>

            <div className="wl-field">
              <label className="wl-label" htmlFor="wl-deposit">
                {t("waitlist.field.deposit")}
              </label>
              <input
                id="wl-deposit"
                className="wl-input"
                type="number"
                min="0"
                step="100"
                placeholder="3840"
                value={form.depositUsd}
                onChange={(e) => update("depositUsd", e.target.value)}
                required
                inputMode="numeric"
              />
              <span className="wl-hint">{t("waitlist.hint.deposit")}</span>
              {form.depositUsd && !validDeposit && (
                <span className="wl-error">{t("waitlist.error.deposit")}</span>
              )}
            </div>

            <div className="wl-field">
              <label className="wl-label" htmlFor="wl-age">
                {t("waitlist.field.kid_age")}
              </label>
              <input
                id="wl-age"
                className="wl-input"
                type="number"
                min="0"
                max="25"
                step="1"
                placeholder="8"
                value={form.kidAge}
                onChange={(e) => update("kidAge", e.target.value)}
                required
                inputMode="numeric"
              />
              {form.kidAge && !validKidAge && (
                <span className="wl-error">{t("waitlist.error.kid_age")}</span>
              )}
            </div>

            <div className="wl-field">
              <label className="wl-label" htmlFor="wl-note">
                {t("waitlist.field.note")}
              </label>
              <textarea
                id="wl-note"
                className="wl-textarea"
                value={form.note}
                onChange={(e) => update("note", e.target.value)}
                placeholder={t("waitlist.placeholder.note")}
                maxLength={500}
              />
            </div>

            {error && <div className="wl-error">{error}</div>}

            <button
              type="submit"
              className="wl-submit"
              disabled={!canSubmit || submitting}
            >
              {submitting ? t("waitlist.submitting") : t("waitlist.submit")}
            </button>

            <p className="wl-fineprint">{t("waitlist.fineprint")}</p>
          </form>
        )}
      </div>
    </div>
  );
}
