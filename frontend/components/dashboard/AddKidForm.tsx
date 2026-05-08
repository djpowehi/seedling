"use client";

import { Keypair, PublicKey } from "@solana/web3.js";
import { useEffect, useRef, useState } from "react";
import type { Connection } from "@solana/web3.js";
import { celebratePlant } from "@/lib/celebrate";
import { addDraftFamily } from "@/lib/draftFamilies";
import { setKidName } from "@/lib/kidNames";
import { setKidPixKey } from "@/lib/kidPix";
import { isValidCpf, isValidEmail } from "@/lib/pixProfile";
import { useToast } from "@/components/Toast";
import { familyPositionPda } from "@/lib/quasarPdas";
import {
  defaultHybridConfig,
  estimatedAnnualYield,
  setDepositMode,
  setHybridConfig,
  totalCommitmentForYear,
  type DepositMode,
  type HybridConfig,
} from "@/lib/depositMode";
import { ArrowR } from "./icons";
import { useLocale, TItalic } from "@/lib/i18n";
import type { TranslationKey } from "@/lib/i18n";

const MIN_STREAM_USD = 1;
// Practical ceiling — chain-side u64 holds way more, but $100k/mo per kid
// is the highest realistic family allowance and prevents accidental
// "I typed 100000 by mistake" disasters.
const MAX_STREAM_USD = 100_000;

type Props = {
  connection: Connection;
  parent: PublicKey;
  onCreated: () => void;
  onCancel: () => void;
};

export function AddKidForm({ connection, parent, onCreated, onCancel }: Props) {
  const { showToast } = useToast();
  const { t, locale } = useLocale();
  // Section ref so the planting confetti fires FROM the form's location
  // (not screen-center). Captured before onCreated unmounts us.
  const sectionRef = useRef<HTMLElement>(null);
  const [nameInput, setNameInput] = useState("");
  const [pixKeyInput, setPixKeyInput] = useState("");
  const [monthlyInput, setMonthlyInput] = useState("100");
  // v3: kid is no longer a wallet input. We generate a random 32-byte
  // identifier client-side that's used purely as a PDA seed. Stable for
  // the lifetime of this form instance — never regenerated on re-render.
  const [kidSeed] = useState<PublicKey>(() => Keypair.generate().publicKey);
  const [mode, setMode] = useState<DepositMode>("yearly");
  // Hybrid amounts the parent dialed in. Strings so the input fields can
  // stay editable mid-keystroke; we parse on render. Defaults to the
  // brand sweet-spot (8× upfront + 0.4× monthly) when hybrid is selected.
  const [hybridUpfrontInput, setHybridUpfrontInput] = useState("800");
  const [hybridMonthlyInput, setHybridMonthlyInput] = useState("40");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Scroll the form into view on mount. The "+ add another kid" button
  // lives at the bottom of the dashboard, but the form renders at the
  // top — without this, clicking the button does nothing visible until
  // the user scrolls up.
  useEffect(() => {
    sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Sync the hybrid pre-fills to whatever stream rate the parent's typed —
  // but only while the parent hasn't manually edited the hybrid fields.
  // Tracked via a "touched" flag so the typed values survive cross-input
  // edits.
  const [hybridTouched, setHybridTouched] = useState(false);
  const monthlyNumForHybridDefault = parseFloat(monthlyInput);
  useEffect(() => {
    if (hybridTouched) return;
    if (
      !Number.isFinite(monthlyNumForHybridDefault) ||
      monthlyNumForHybridDefault <= 0
    )
      return;
    const def = defaultHybridConfig(monthlyNumForHybridDefault);
    setHybridUpfrontInput(String(def.upfrontUsd));
    setHybridMonthlyInput(String(def.monthlyUsd));
  }, [monthlyNumForHybridDefault, hybridTouched]);

  // v3: parsedKid is just the auto-generated kidSeed. No validation
  // needed — the form always produces a fresh, valid Pubkey.
  const parsedKid: PublicKey = kidSeed;

  const monthlyNum = parseFloat(monthlyInput);
  let rateValidationError: string | null = null;
  if (!monthlyInput.trim()) {
    rateValidationError = null;
  } else if (Number.isNaN(monthlyNum) || !Number.isFinite(monthlyNum)) {
    rateValidationError = t("add_kid.monthly.error.number");
  } else if (monthlyNum < MIN_STREAM_USD) {
    rateValidationError = t("add_kid.monthly.error.min", {
      min: MIN_STREAM_USD,
    });
  } else if (monthlyNum > MAX_STREAM_USD) {
    rateValidationError = t("add_kid.monthly.error.max", {
      max: MAX_STREAM_USD,
    });
  }

  // Pix key validation. Optional field — empty is fine. If the parent
  // typed something, we figure out which kind of key it is and run the
  // matching validator. Wrong format here means 4P will reject the
  // payout later; cheaper to catch it now.
  let pixKeyError: string | null = null;
  const pixTrimmed = pixKeyInput.trim();
  if (pixTrimmed.length > 0) {
    if (pixTrimmed.includes("@")) {
      if (!isValidEmail(pixTrimmed)) {
        pixKeyError = t("add_kid.pix_key.error.email");
      }
    } else if (pixTrimmed.startsWith("+")) {
      // E.164 phone: + then 10-15 digits.
      const digits = pixTrimmed.slice(1).replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 15) {
        pixKeyError = t("add_kid.pix_key.error.phone");
      }
    } else {
      // No @, no +. Treat as CPF — must validate via mod-11 algorithm.
      if (!isValidCpf(pixTrimmed)) {
        pixKeyError = t("add_kid.pix_key.error.cpf");
      }
    }
  }

  // v3: no duplicate check — every family gets a fresh random seed,
  // so the family_position PDA is unique by construction.

  // For hybrid mode: parent's deposits across the year must at least
  // cover the kid's allowance. Otherwise the kid's monthly distributes
  // would fail mid-year. We block submit on this rather than letting
  // the parent ship a broken setup.
  const hybridShortfallBlocking =
    mode === "hybrid" &&
    Number.isFinite(monthlyNum) &&
    monthlyNum > 0 &&
    parseFloat(hybridUpfrontInput) + parseFloat(hybridMonthlyInput) * 11 <
      monthlyNum * 12;

  const submitDisabled =
    submitting ||
    rateValidationError !== null ||
    pixKeyError !== null ||
    !monthlyInput.trim() ||
    hybridShortfallBlocking;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitDisabled || !parsedKid) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      // Lazy creation: nothing on-chain happens here. We persist the kid
      // as a "draft family" in localStorage and let the first deposit
      // create the FamilyPosition + KidView accounts atomically with the
      // deposit instruction. Avoids the $0.62 sponsor-cost ghost-family
      // subsidy when a parent adds a kid and never deposits.
      const familyPda = familyPositionPda(parent, parsedKid);
      addDraftFamily({
        parent: parent.toBase58(),
        kid: parsedKid.toBase58(),
        monthlyUsd: monthlyNum,
        createdAt: Math.floor(Date.now() / 1000),
      });
      if (nameInput.trim()) setKidName(familyPda.toBase58(), nameInput);
      if (pixKeyInput.trim()) setKidPixKey(familyPda.toBase58(), pixKeyInput);
      setDepositMode(familyPda.toBase58(), mode);
      if (mode === "hybrid") {
        const upfront = parseFloat(hybridUpfrontInput);
        const monthly = parseFloat(hybridMonthlyInput);
        if (Number.isFinite(upfront) && Number.isFinite(monthly)) {
          setHybridConfig(familyPda.toBase58(), {
            upfrontUsd: upfront,
            monthlyUsd: monthly,
          });
        }
      }

      const origin = computeOrigin(sectionRef.current);
      void celebratePlant(origin);
      showToast({
        variant: "monthly",
        title: nameInput.trim()
          ? t("add_kid.toast.title.named", { name: nameInput.trim() })
          : t("add_kid.toast.title.unnamed"),
        subtitle: t("add_kid.toast.subtitle", { monthly: monthlyNum }),
      });
      onCreated();
    } catch (e: unknown) {
      // localStorage failure is the only failure mode now — quota or
      // private-mode browsers. Surface the raw message so the user
      // knows why the form didn't progress.
      const msg = e instanceof Error ? e.message : String(e);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      ref={sectionRef}
      className="dash-card"
      style={{
        padding: "36px 40px",
        marginBottom: 32,
        background: "var(--stone-2)",
        border: "1px solid var(--line)",
        // Leaves breathing room above the eyebrow when scrollIntoView
        // lands the form — without this the seedling header overlaps
        // the "new family" eyebrow line.
        scrollMarginTop: 120,
      }}
    >
      <div
        className="dash-row"
        style={{ justifyContent: "space-between", alignItems: "flex-start" }}
      >
        <div className="dash-col" style={{ gap: 10 }}>
          <span className="dash-eyebrow">
            <span className="rule" /> {t("add_kid.eyebrow")}
          </span>
          <h2
            className="dash-serif"
            style={{ fontSize: 40, lineHeight: 1, margin: 0 }}
          >
            <TItalic
              tplKey="add_kid.title.line"
              italicKey="add_kid.title.italic"
            />
          </h2>
        </div>
        <button className="dash-btn-link" onClick={onCancel}>
          {t("add_kid.close")}
        </button>
      </div>

      <form
        onSubmit={submit}
        className="dash-col"
        style={{ gap: 18, marginTop: 28 }}
      >
        <div className="dash-addkid-grid">
          <div className="dash-col">
            <label className="dash-field-label">
              {t("add_kid.name.label")}{" "}
              <span
                style={{
                  textTransform: "none",
                  letterSpacing: 0,
                  color: "var(--ink-3)",
                }}
              >
                {t("add_kid.name.optional")}
              </span>
            </label>
            <input
              type="text"
              placeholder={t("add_kid.name.placeholder")}
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
            />
          </div>
          <div className="dash-col">
            <label className="dash-field-label">
              {t("add_kid.pix_key.label")}{" "}
              <span
                style={{
                  textTransform: "none",
                  letterSpacing: 0,
                  color: "var(--ink-3)",
                }}
              >
                {t("add_kid.pix_key.optional")}
              </span>
            </label>
            <input
              className="dash-mono-input"
              placeholder={t("add_kid.pix_key.placeholder")}
              value={pixKeyInput}
              onChange={(e) => setPixKeyInput(e.target.value)}
            />
            {pixKeyError ? (
              <span
                className="dash-mono"
                style={{ fontSize: 11, color: "var(--rose)", marginTop: 6 }}
              >
                {pixKeyError}
              </span>
            ) : (
              <span
                style={{
                  fontSize: 11,
                  color: "var(--ink-3)",
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                {t("add_kid.pix_key.hint")}
              </span>
            )}
          </div>
          <div className="dash-col">
            <label className="dash-field-label">
              {t("add_kid.monthly.label", { min: MIN_STREAM_USD })}
            </label>
            <input
              className="dash-mono-input"
              type="number"
              min={MIN_STREAM_USD}
              max={MAX_STREAM_USD}
              value={monthlyInput}
              onChange={(e) => setMonthlyInput(e.target.value)}
            />
            {/* Currency clarifier — PT-BR only. Brazilian users read "$"
                as R$ by reflex, so we explicitly disambiguate. EN readers
                map "$" to USD instinctively; the note would be condescending. */}
            {locale === "pt-BR" && (
              <span
                className="dash-mono"
                style={{
                  fontSize: 10,
                  color: "var(--ink-3)",
                  marginTop: 6,
                  letterSpacing: "0.04em",
                }}
              >
                {t("add_kid.monthly.currency_note")}
              </span>
            )}
            {rateValidationError && (
              <span
                className="dash-mono"
                style={{ fontSize: 11, color: "var(--rose)", marginTop: 6 }}
              >
                {rateValidationError}
              </span>
            )}
            {!rateValidationError &&
              Number.isFinite(monthlyNum) &&
              monthlyNum > 0 && (
                <span
                  className="dash-mono"
                  style={{
                    fontSize: 11,
                    color: "var(--ink-3)",
                    marginTop: 6,
                    lineHeight: 1.5,
                  }}
                >
                  {t("add_kid.monthly.recommended", {
                    total: (monthlyNum * 24).toLocaleString(),
                    cover: (monthlyNum * 12).toLocaleString(),
                    bonus: (monthlyNum * 12).toLocaleString(),
                  })}
                </span>
              )}
          </div>
        </div>

        <ModePicker
          mode={mode}
          onChange={setMode}
          streamRateUsd={
            Number.isFinite(monthlyNum) && monthlyNum > 0 ? monthlyNum : 50
          }
          hybridUpfrontInput={hybridUpfrontInput}
          hybridMonthlyInput={hybridMonthlyInput}
          onHybridUpfrontChange={(v) => {
            setHybridUpfrontInput(v);
            setHybridTouched(true);
          }}
          onHybridMonthlyChange={(v) => {
            setHybridMonthlyInput(v);
            setHybridTouched(true);
          }}
        />

        {submitError && (
          <div
            className="dash-mono"
            style={{ color: "var(--rose)", fontSize: 12 }}
          >
            {submitError}
          </div>
        )}

        <div
          className="dash-row"
          style={{ gap: 10, alignItems: "center", marginTop: 6 }}
        >
          <button
            className="dash-btn dash-btn-primary"
            type="submit"
            disabled={submitDisabled}
          >
            {submitting ? t("add_kid.creating") : t("add_kid.submit")}{" "}
            <ArrowR color="currentColor" />
          </button>
          <span
            className="dash-mono"
            style={{ fontSize: 11, color: "var(--ink-3)" }}
          >
            {t("add_kid.fee_note")}
          </span>
        </div>

        <div
          style={{
            marginTop: 14,
            paddingTop: 18,
            borderTop: "1px solid var(--line)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <span
            className="dash-mono"
            style={{ fontSize: 11, color: "var(--ink-3)" }}
          >
            {t("add_kid.faucets.label")}
          </span>
          <div className="dash-row" style={{ gap: 18 }}>
            <a
              className="dash-btn-link"
              href="https://solfaucet.com"
              target="_blank"
              rel="noreferrer"
            >
              {t("add_kid.faucets.sol")}
            </a>
            <a
              className="dash-btn-link"
              href="https://faucet.circle.com/?token=USDC&blockchain=SOL"
              target="_blank"
              rel="noreferrer"
            >
              {t("add_kid.faucets.usdc")}
            </a>
          </div>
        </div>
      </form>
    </section>
  );
}

/** Convert an element's bounding rect to canvas-confetti's normalized
 *  [0..1] viewport coordinates. Returns the element's center-bottom so
 *  the planting sprout rises FROM the new family card area, not screen-
 *  center. Falls back to lower-center on null. */
function computeOrigin(el: HTMLElement | null): { x: number; y: number } {
  if (!el || typeof window === "undefined") {
    return { x: 0.5, y: 0.7 };
  }
  const r = el.getBoundingClientRect();
  return {
    x: (r.left + r.width / 2) / window.innerWidth,
    y: (r.top + r.height * 0.85) / window.innerHeight,
  };
}

// ──────────── deposit-cadence picker ────────────
//
// Three pills, each showing the live total commitment + projected yield
// at the current stream rate. Re-computed on every keystroke in the
// monthly input — drives the trade-off message home: "yearly = $X,
// hybrid = $Y, monthly = $Z, here's what you'd actually earn."

function ModePicker({
  mode,
  onChange,
  streamRateUsd,
  hybridUpfrontInput,
  hybridMonthlyInput,
  onHybridUpfrontChange,
  onHybridMonthlyChange,
}: {
  mode: DepositMode;
  onChange: (m: DepositMode) => void;
  streamRateUsd: number;
  hybridUpfrontInput: string;
  hybridMonthlyInput: string;
  onHybridUpfrontChange: (v: string) => void;
  onHybridMonthlyChange: (v: string) => void;
}) {
  const { t } = useLocale();
  const modes: DepositMode[] = ["yearly", "hybrid", "monthly"];

  // Live hybrid config from the parent's typed values. Falls back to
  // brand default if either field is empty/invalid so the yield estimate
  // is always meaningful.
  const upfrontParsed = parseFloat(hybridUpfrontInput);
  const monthlyParsed = parseFloat(hybridMonthlyInput);
  const liveHybrid: HybridConfig = {
    upfrontUsd:
      Number.isFinite(upfrontParsed) && upfrontParsed >= 0 ? upfrontParsed : 0,
    monthlyUsd:
      Number.isFinite(monthlyParsed) && monthlyParsed >= 0 ? monthlyParsed : 0,
  };

  // Total kid will need over the year — used to validate that the
  // parent's chosen hybrid commitment actually covers the allowance.
  const minCommitment = streamRateUsd * 12;
  const hybridTotal = liveHybrid.upfrontUsd + liveHybrid.monthlyUsd * 11;
  const hybridYield = estimatedAnnualYield(
    "hybrid",
    streamRateUsd,
    8,
    liveHybrid
  );
  const yearlyYield = estimatedAnnualYield("yearly", streamRateUsd);
  const hybridRecovery =
    yearlyYield > 0 ? Math.round((hybridYield / yearlyYield) * 100) : 0;
  const hybridShortfall = Math.max(0, minCommitment - hybridTotal);

  return (
    <div
      className="dash-col"
      style={{
        gap: 10,
        marginTop: 4,
      }}
    >
      <span
        className="dash-mono"
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}
      >
        {t("mode.section.label")}
      </span>
      {/* Principle line — frames the cadence asymmetry as intentional
          design (seedling rewards time), not a limitation of monthly. */}
      <p
        className="dash-serif"
        style={{
          margin: 0,
          fontSize: 17,
          lineHeight: 1.35,
          color: "var(--ink-2)",
          letterSpacing: "-0.005em",
        }}
      >
        {t("mode.tagline.start")}{" "}
        <span className="dash-italic">{t("mode.tagline.italic")}</span>
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 8,
        }}
      >
        {modes.map((m) => {
          const total =
            m === "hybrid"
              ? hybridTotal
              : totalCommitmentForYear(m, streamRateUsd);
          const yearly =
            m === "hybrid"
              ? hybridYield
              : estimatedAnnualYield(m, streamRateUsd);
          const isActive = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              className="dash-mode-pill"
              style={{
                textAlign: "left",
                padding: "14px 16px",
                borderRadius: 8,
                cursor: "pointer",
                background: isActive ? "var(--forest)" : "var(--stone)",
                color: isActive ? "#F7F2E3" : "var(--ink)",
                border: `1px solid ${
                  isActive ? "var(--forest)" : "var(--line)"
                }`,
                transition: "all 160ms ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <span
                  className="dash-serif"
                  style={{ fontSize: 18, lineHeight: 1.05 }}
                >
                  {t(`mode.${m}.label` as TranslationKey)}
                </span>
                {m === "yearly" && (
                  <span
                    style={{
                      fontFamily: "var(--font-jetbrains-mono), monospace",
                      fontSize: 9,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      padding: "2px 7px",
                      borderRadius: 99,
                      background: isActive
                        ? "rgba(247, 242, 227, 0.18)"
                        : "var(--forest)",
                      color: isActive ? "#F7F2E3" : "#F7F2E3",
                      border: isActive
                        ? "1px solid rgba(247, 242, 227, 0.4)"
                        : "1px solid var(--forest)",
                    }}
                  >
                    {t("mode.recommended_badge")}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  letterSpacing: "0.04em",
                  color: isActive ? "#E8DDC2" : "var(--ink-3)",
                  marginBottom: 8,
                }}
              >
                {t(`mode.${m}.desc` as TranslationKey)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                  color: isActive ? "#F7F2E3" : "var(--ink-2)",
                  letterSpacing: "0.02em",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                {m === "yearly" ? (
                  <>
                    <span>
                      {t("mode.yearly.upfront_line", {
                        total: Math.round(total).toLocaleString(),
                      })}
                    </span>
                    <span style={{ opacity: 0.85 }}>
                      {t("mode.yearly.return_line", {
                        back: (streamRateUsd * 12).toLocaleString(),
                        bonus: yearly.toFixed(2),
                      })}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      {t("mode.year_total_line", {
                        total: Math.round(total).toLocaleString(),
                      })}
                    </span>
                    <span style={{ opacity: 0.85 }}>
                      {t("mode.year_bonus_line", {
                        bonus: yearly.toFixed(2),
                      })}
                    </span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Expandable hybrid customization — appears only when hybrid is
          the active mode. Two inputs (upfront / monthly) + live yield calc. */}
      {mode === "hybrid" && (
        <div
          style={{
            marginTop: 4,
            padding: "16px 18px",
            borderRadius: 10,
            background: "var(--stone)",
            border: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <div className="dash-col">
              <label
                className="dash-field-label"
                style={{ fontSize: 10, marginBottom: 6 }}
              >
                {t("mode.hybrid.upfront_label")}
              </label>
              <input
                className="dash-mono-input"
                type="number"
                min={0}
                step={1}
                value={hybridUpfrontInput}
                onChange={(e) => onHybridUpfrontChange(e.target.value)}
              />
            </div>
            <div className="dash-col">
              <label
                className="dash-field-label"
                style={{ fontSize: 10, marginBottom: 6 }}
              >
                {t("mode.hybrid.monthly_label")}
              </label>
              <input
                className="dash-mono-input"
                type="number"
                min={0}
                step={1}
                value={hybridMonthlyInput}
                onChange={(e) => onHybridMonthlyChange(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              fontFamily: "var(--font-jetbrains-mono), monospace",
              fontSize: 11,
              color: "var(--ink-2)",
              display: "flex",
              flexDirection: "column",
              gap: 4,
              paddingTop: 6,
              borderTop: "1px dashed var(--line)",
            }}
          >
            <span>
              {t("mode.hybrid.total_line", {
                total: Math.round(hybridTotal).toLocaleString(),
                kid: (streamRateUsd * 12).toLocaleString(),
              })}
            </span>
            <span>
              {t("mode.hybrid.bonus_line", {
                bonus: hybridYield.toFixed(2),
                pct: hybridRecovery,
                yearly: yearlyYield.toFixed(2),
              })}
            </span>
          </div>

          {/* Suggest switching out of hybrid when one of the two amounts
              is zero — that's not a hybrid, that's yearly (monthly=0)
              or monthly (upfront=0). Cleaner for the parent. */}
          {liveHybrid.upfrontUsd === 0 && liveHybrid.monthlyUsd > 0 && (
            <button
              type="button"
              onClick={() => onChange("monthly")}
              className="dash-mono"
              style={{
                fontSize: 11,
                color: "var(--forest-deep)",
                background: "rgba(46, 92, 64, 0.08)",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid rgba(46, 92, 64, 0.25)",
                cursor: "pointer",
                textAlign: "left",
                lineHeight: 1.5,
              }}
            >
              {t("mode.hybrid.zero_upfront")}
            </button>
          )}
          {liveHybrid.upfrontUsd > 0 && liveHybrid.monthlyUsd === 0 && (
            <button
              type="button"
              onClick={() => onChange("yearly")}
              className="dash-mono"
              style={{
                fontSize: 11,
                color: "var(--forest-deep)",
                background: "rgba(46, 92, 64, 0.08)",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid rgba(46, 92, 64, 0.25)",
                cursor: "pointer",
                textAlign: "left",
                lineHeight: 1.5,
              }}
            >
              {t("mode.hybrid.zero_monthly")}
            </button>
          )}

          {hybridShortfall > 0 &&
            liveHybrid.upfrontUsd > 0 &&
            liveHybrid.monthlyUsd > 0 && (
              <div
                className="dash-mono"
                style={{
                  fontSize: 11,
                  color: "var(--rose)",
                  background: "rgba(176, 71, 58, 0.08)",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "1px solid rgba(176, 71, 58, 0.25)",
                }}
              >
                {t("mode.hybrid.shortfall", {
                  total: Math.round(hybridTotal).toLocaleString(),
                  need: minCommitment.toLocaleString(),
                  short: Math.round(hybridShortfall).toLocaleString(),
                })}
              </div>
            )}
        </div>
      )}

      {/* Honest enforcement disclosure — protocol does NOT lock the parent
          into monthly deposits. Funds already deposited stay safe; if a
          top-up is missed, the kid's allowance simply pauses until the
          parent tops up. Same disclosure on every mode for consistency. */}
      <div
        className="dash-mono"
        style={{
          fontSize: 11,
          color: "var(--ink-3)",
          padding: "10px 12px",
          background: "rgba(46, 92, 64, 0.04)",
          border: "1px dashed var(--line)",
          borderRadius: 6,
          letterSpacing: 0,
          textTransform: "none",
          lineHeight: 1.5,
        }}
      >
        {t("mode.disclosure")}
      </div>
    </div>
  );
}
