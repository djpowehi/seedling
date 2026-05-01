"use client";

// Year-end recap on the kid view. Two surfaces:
//
//   1. Inline CTA on the kid view (where this component lives in the
//      DOM): a single tappable card "your year, [name]" → opens the
//      stories overlay.
//
//   2. Fullscreen stories overlay (Instagram-stories style): one slide
//      at a time, tap right half to advance, tap left half to go back,
//      × or ESC to close. ~17 slides total: hero + 12 monthly + best
//      month + total deposited + total yielded + final % growth + share.
//
// The "actual" year-recap data is computed deterministically per family
// and per year (no on-chain history needed for the demo).

import { useEffect, useMemo, useRef, useState } from "react";

import {
  buildYearRecap,
  type MonthRecap,
  type YearRecap,
} from "@/lib/yearRecap";
import { renderYearShareCard } from "@/lib/yearShareCard";
import { canNativeShare, downloadImage, shareImage } from "@/lib/shareCard";
import { Tree, type Stage } from "@/components/Tree";

type Props = {
  familyKey: string;
  kidName: string | null;
  /** Family creation timestamp in seconds. Anchors the recap window to the
   *  family's actual start month — a family created in August recaps
   *  Aug → next-year Jul, not Jan → Dec. */
  createdAtSec: number;
  /** Monthly stream rate in dollars. */
  monthlyStreamRateUsd: number;
  /** True when the on-chain bonus period has ended and the 13th allowance
   *  is claimable / claimed. Drives the "your year is here" framing. */
  bonusReady: boolean;
};

export function YearRecap({
  familyKey,
  kidName,
  createdAtSec,
  monthlyStreamRateUsd,
  bonusReady,
}: Props) {
  // Recap data — deterministic per (family, start cycle).
  const recap = useMemo<YearRecap>(
    () =>
      buildYearRecap(
        familyKey,
        createdAtSec,
        monthlyStreamRateUsd > 0 ? monthlyStreamRateUsd : 50
      ),
    [familyKey, createdAtSec, monthlyStreamRateUsd]
  );

  const startYear = recap.startCycleKey.slice(0, 4);
  const endYear = recap.endCycleKey.slice(0, 4);
  const yearLabel =
    startYear === endYear ? startYear : `${startYear}–${endYear}`;

  const slides = useMemo<Slide[]>(
    () => buildSlides(recap, kidName ?? "friend", bonusReady, yearLabel),
    [recap, kidName, bonusReady, yearLabel]
  );

  const [open, setOpen] = useState(false);
  const [slideIdx, setSlideIdx] = useState(0);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Lock body scroll while the overlay is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ESC + arrow-key nav.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
      else if (e.key === "ArrowRight" || e.key === " ") handleNext();
      else if (e.key === "ArrowLeft") handlePrev();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, slideIdx, slides.length]);

  // Revoke preview URL.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleOpen = () => {
    setSlideIdx(0);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewBlob(null);
    setPreviewUrl(null);
  };

  const handleNext = () => {
    setSlideIdx((i) => Math.min(slides.length - 1, i + 1));
  };
  const handlePrev = () => {
    setSlideIdx((i) => Math.max(0, i - 1));
  };

  // Tap anywhere on the slide to advance/go-back. Earlier we used
  // dedicated tap-zone <button>s positioned at z-index 1, but the slide
  // itself sits at z-index 2 and fills the stage — so the tap zones were
  // covered by the slide and never received touch events on mobile (and
  // mouse clicks on desktop). Putting the handler on the stage itself
  // works regardless of inner stacking; interactive children short-
  // circuit via the closest('button, a, input') check below so the
  // share / close / chip buttons keep working.
  const handleStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, label")) return;
    if (previewUrl) return; // preview modal is open — its own UI handles it
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX < rect.left + rect.width / 2) handlePrev();
    else handleNext();
  };

  const handleShare = async () => {
    setBusy(true);
    try {
      const blob = await renderYearShareCard({
        kidName: kidName ?? "kid",
        recap,
      });
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
    } catch {
      // silent; close button still works
    } finally {
      setBusy(false);
    }
  };

  const filename = `seedling-${kidName ?? "kid"}-${yearLabel}-year.png`;
  const sharable = previewBlob ? canNativeShare(previewBlob, filename) : false;

  const handleSharePreview = async () => {
    if (!previewBlob) return;
    await shareImage(previewBlob, filename);
  };

  const handleDownloadPreview = () => {
    if (!previewBlob) return;
    downloadImage(previewBlob, filename);
  };

  // ──────────── render ────────────

  const ctaLabel = bonusReady
    ? `your ${yearLabel} just landed — relive it`
    : `your year so far · tap to relive it`;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: YEAR_STYLES }} />

      <button
        type="button"
        className={`yr-cta ${bonusReady ? "yr-cta-celebrate" : ""}`}
        onClick={handleOpen}
      >
        <span className="yr-cta-eyebrow">
          {bonusReady ? "annual bonus" : "year recap"}
        </span>
        <span className="yr-cta-title">{ctaLabel}</span>
        <span className="yr-cta-num">+{recap.percentGrowth.toFixed(2)}%</span>
      </button>

      {open && (
        <div className="yr-overlay" onClick={handleClose}>
          <div
            className={`yr-stage ${previewUrl ? "yr-stage-preview-open" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              handleStageClick(e);
            }}
          >
            <div className="yr-progress">
              {slides.map((_, i) => (
                <span
                  key={i}
                  className={`yr-pip ${i < slideIdx ? "yr-pip-done" : ""} ${
                    i === slideIdx ? "yr-pip-active" : ""
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              className="yr-close"
              onClick={handleClose}
              aria-label="close"
            >
              ×
            </button>

            <SlideView
              slide={slides[slideIdx]}
              recap={recap}
              onShare={handleShare}
              onClose={handleClose}
              busy={busy}
              previewUrl={previewUrl}
              sharable={sharable}
              onShareCard={handleSharePreview}
              onDownloadCard={handleDownloadPreview}
              onClosePreview={() => {
                if (previewUrl) URL.revokeObjectURL(previewUrl);
                setPreviewBlob(null);
                setPreviewUrl(null);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

// ──────────── slide model ────────────

type Slide =
  | { kind: "hero"; yearLabel: string; kidName: string; bonusReady: boolean }
  | {
      kind: "month";
      month: MonthRecap;
      cumulativeYieldMax: number;
      /** 1..12 — matches the kid's actual tree at that point in their year.
       *  Recap months are ordered oldest-first from creation, so index+1
       *  IS the months-since-creation stage. Slide for month #1 shows
       *  Stage1 (seed only), month #12 shows Stage12 (mature with acorns). */
      stage: Stage;
    }
  | { kind: "best"; best: MonthRecap; stage: Stage }
  | { kind: "deposited"; total: number }
  | { kind: "yielded"; total: number; bonusReady: boolean }
  | { kind: "growth"; pct: number }
  | { kind: "share" };

function buildSlides(
  recap: YearRecap,
  kidName: string,
  bonusReady: boolean,
  yearLabel: string
): Slide[] {
  // Cumulative yield grows monotonically across the year — gives a satisfying
  // bar that fills toward 100% on the December slide. Principal alone would
  // shrink (it's drawn down each month), and total balance is roughly flat.
  const cumulativeYieldMax = Math.max(
    ...recap.months.map((m) => m.cumulativeYieldUsd),
    0.01
  );
  // Best-month stage = the tree size at THAT month — calendar-aligned with
  // the moment the kid actually saw their best yield.
  const bestIdx = recap.months.findIndex(
    (m) => m.cycleKey === recap.bestMonth.cycleKey
  );
  const bestStage = (Math.max(0, bestIdx) + 1) as Stage;
  const slides: Slide[] = [
    { kind: "hero", yearLabel, kidName, bonusReady },
    ...recap.months.map(
      (m, i): Slide => ({
        kind: "month",
        month: m,
        cumulativeYieldMax,
        stage: (i + 1) as Stage,
      })
    ),
    { kind: "best", best: recap.bestMonth, stage: bestStage },
    { kind: "deposited", total: recap.totalDepositedUsd },
    { kind: "yielded", total: recap.totalYieldedUsd, bonusReady },
    { kind: "growth", pct: recap.percentGrowth },
    { kind: "share" },
  ];
  return slides;
}

// ──────────── slide renderers ────────────

function SlideView({
  slide,
  recap,
  onShare,
  onClose,
  busy,
  previewUrl,
  sharable,
  onShareCard,
  onDownloadCard,
  onClosePreview,
}: {
  slide: Slide;
  recap: YearRecap;
  onShare: () => void;
  onClose: () => void;
  busy: boolean;
  previewUrl: string | null;
  sharable: boolean;
  onShareCard: () => void;
  onDownloadCard: () => void;
  onClosePreview: () => void;
}) {
  const startYear = recap.startCycleKey.slice(0, 4);
  const endYear = recap.endCycleKey.slice(0, 4);
  const yearLabel =
    startYear === endYear ? startYear : `${startYear}–${endYear}`;
  if (slide.kind === "hero") {
    return (
      <div className="yr-slide yr-slide-hero">
        <div className="yr-eyebrow">{slide.yearLabel} · seedling</div>
        <h2 className="yr-headline">
          {slide.bonusReady ? "your year." : "your year so far."}
        </h2>
        <p className="yr-sub">
          {slide.kidName === "friend"
            ? "let's look back."
            : `let's look back, ${slide.kidName}.`}
        </p>
        <div className="yr-tap-hint">tap to start →</div>
      </div>
    );
  }

  if (slide.kind === "month") {
    const pct = slide.month.cumulativeYieldUsd / slide.cumulativeYieldMax;
    return (
      <div className="yr-slide yr-slide-month">
        <div className="yr-month-tree">
          <Tree stage={slide.stage} />
        </div>
        <div className="yr-eyebrow">{slide.month.monthLabel.toLowerCase()}</div>
        <div className="yr-month-line">your savings earned</div>
        <h2 className="yr-headline-big">${slide.month.yieldUsd.toFixed(2)}</h2>
        <div className="yr-month-foot">
          at {(slide.month.apyEffectiveBps / 100).toFixed(1)}% APY
        </div>
        <div className="yr-month-bar">
          <span style={{ width: `${pct * 100}%` }} />
        </div>
        <div className="yr-month-balance">
          yield so far: ${slide.month.cumulativeYieldUsd.toFixed(2)}
        </div>
      </div>
    );
  }

  if (slide.kind === "best") {
    return (
      <div className="yr-slide yr-slide-best">
        <div className="yr-month-tree">
          <Tree stage={slide.stage} />
        </div>
        <div className="yr-eyebrow">your best month</div>
        <h2 className="yr-headline">{slide.best.monthLabel}.</h2>
        <p className="yr-sub">
          earned <em>${slide.best.yieldUsd.toFixed(2)}</em> at{" "}
          {(slide.best.apyEffectiveBps / 100).toFixed(1)}% APY.
        </p>
      </div>
    );
  }

  if (slide.kind === "deposited") {
    return (
      <div className="yr-slide">
        <div className="yr-eyebrow">you put in</div>
        <h2 className="yr-headline-num">${slide.total.toFixed(2)}</h2>
        <p className="yr-sub">across the year.</p>
      </div>
    );
  }

  if (slide.kind === "yielded") {
    return (
      <div className="yr-slide yr-slide-yielded">
        <div className="yr-eyebrow">
          {slide.bonusReady ? "your annual bonus" : "what your savings earned"}
        </div>
        <h2 className="yr-headline-num yr-emphasized">
          ${slide.total.toFixed(2)}
        </h2>
        <p className="yr-sub">
          {slide.bonusReady
            ? "just landed in your wallet — pure yield."
            : "just from your savings sitting still."}
        </p>
      </div>
    );
  }

  if (slide.kind === "growth") {
    return (
      <div className="yr-slide">
        <div className="yr-eyebrow">that&apos;s</div>
        <h2 className="yr-headline-num yr-amber">+{slide.pct.toFixed(2)}%</h2>
        <p className="yr-sub">growth, without you doing anything.</p>
      </div>
    );
  }

  // share
  return (
    <div className="yr-slide">
      <div className="yr-eyebrow">share your year</div>
      <h2 className="yr-headline">make it a card.</h2>
      <p className="yr-sub">
        a single image with everything — send it to grandma.
      </p>
      <div className="yr-actions">
        <button
          type="button"
          className="yr-btn yr-btn-primary"
          onClick={onShare}
          disabled={busy}
        >
          {busy ? "making your card…" : "see my card"}
        </button>
        <button type="button" className="yr-btn yr-btn-quiet" onClick={onClose}>
          done
        </button>
      </div>

      {previewUrl && (
        <div className="yr-preview-overlay" onClick={onClosePreview}>
          <div
            className="yr-preview-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="yr-close yr-close-preview"
              onClick={onClosePreview}
              aria-label="close"
            >
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewUrl}
              alt={`seedling ${yearLabel} year recap`}
              className="yr-preview-img"
            />
            <div className="yr-actions">
              {sharable && (
                <button
                  type="button"
                  className="yr-btn yr-btn-primary"
                  onClick={onShareCard}
                >
                  share
                </button>
              )}
              <button
                type="button"
                className="yr-btn yr-btn-primary"
                onClick={onDownloadCard}
              >
                download
              </button>
              <button
                type="button"
                className="yr-btn yr-btn-quiet"
                onClick={onClosePreview}
              >
                close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────── styles ────────────

const YEAR_STYLES = `
  /* CTA on the kid view */
  .yr-cta {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 16px;
    padding: 18px 18px;
    background: var(--stone-50);
    border: 1px solid var(--stone-200);
    border-radius: 14px;
    color: var(--green-900);
    cursor: pointer;
    text-align: left;
    font-family: var(--sans);
    transition: all 180ms ease;
  }
  .yr-cta:hover {
    border-color: var(--green-600);
    background: var(--stone-100);
  }
  .yr-cta-celebrate {
    background: linear-gradient(135deg, var(--stone-50), #FFF6E0);
    border-color: #C5944A;
  }
  .yr-cta-celebrate:hover {
    background: linear-gradient(135deg, var(--stone-100), #FFEDC4);
  }
  .yr-cta-eyebrow {
    font-family: var(--mono); font-size: 10.5px; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--ink-muted);
  }
  .yr-cta-title {
    font-family: var(--serif); font-size: 22px; line-height: 1.1;
    letter-spacing: -0.005em; color: var(--green-900);
  }
  .yr-cta-num {
    font-family: var(--serif); font-style: italic;
    font-size: 22px; color: var(--green-700);
    letter-spacing: -0.01em;
  }

  /* Stories overlay */
  .yr-overlay {
    position: fixed; inset: 0;
    background: rgba(31, 58, 42, 0.92);
    z-index: 70;
    display: flex; align-items: center; justify-content: center;
    animation: yr-fade 220ms ease-out;
  }
  @keyframes yr-fade { from { opacity: 0; } to { opacity: 1; } }
  .yr-stage {
    position: relative;
    width: 100%; max-width: 480px;
    height: 100%;
    background: var(--stone-50);
    overflow: hidden;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  }
  @media (min-width: 540px) {
    .yr-stage { height: 86vh; max-height: 880px; border-radius: 16px; }
  }

  .yr-progress {
    position: absolute; top: 14px; left: 14px; right: 14px;
    display: flex; gap: 4px;
    z-index: 4;
  }
  .yr-pip {
    flex: 1; height: 3px; background: rgba(36, 74, 51, 0.18);
    border-radius: 2px;
    transition: background 200ms ease;
  }
  .yr-pip-done { background: var(--green-700); }
  .yr-pip-active { background: var(--green-800); }
  .yr-close {
    position: absolute; top: 12px; right: 12px;
    width: 36px; height: 36px;
    background: rgba(36, 74, 51, 0.08);
    border: none; border-radius: 50%;
    font-size: 22px; line-height: 1; color: var(--ink);
    cursor: pointer; z-index: 5;
  }
  .yr-close:hover { background: rgba(36, 74, 51, 0.18); }

  /* Slide content */
  .yr-slide {
    position: absolute; inset: 0;
    padding: 64px 40px 48px;
    display: flex; flex-direction: column; justify-content: center;
    gap: 18px;
    background: var(--stone-50);
    z-index: 2;
    animation: yr-slide-in 320ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  @keyframes yr-slide-in {
    from { opacity: 0; transform: translateX(20px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  .yr-slide-hero {
    background: linear-gradient(140deg, var(--stone-50), #DFE8DD);
  }
  .yr-slide-yielded {
    background: linear-gradient(140deg, var(--stone-50), #F5EBC8);
  }

  .yr-eyebrow {
    font-family: var(--mono); font-size: 11px;
    letter-spacing: 0.18em; text-transform: uppercase;
    color: var(--ink-muted);
  }
  .yr-headline {
    font-family: var(--serif);
    font-weight: 400; font-size: 64px; line-height: 0.95;
    color: var(--green-900);
    letter-spacing: -0.02em;
    margin: 0;
  }
  .yr-headline em { font-style: italic; color: var(--green-700); }
  .yr-headline-big {
    font-family: var(--serif);
    font-size: 96px; line-height: 1; letter-spacing: -0.02em;
    color: var(--green-900);
    margin: 0; font-variant-numeric: tabular-nums;
  }
  .yr-headline-num {
    font-family: var(--serif);
    font-size: 88px; line-height: 1;
    color: var(--green-900);
    letter-spacing: -0.02em;
    margin: 0; font-variant-numeric: tabular-nums;
  }
  .yr-emphasized { color: var(--green-700); font-style: italic; }
  .yr-amber { color: #C5944A; font-style: italic; }
  .yr-sub {
    font-size: 18px; line-height: 1.45;
    color: var(--ink-soft); margin: 0;
  }
  .yr-sub em { color: var(--green-700); font-style: italic; }
  .yr-tap-hint {
    margin-top: auto;
    font-family: var(--mono); font-size: 11px;
    color: var(--ink-muted); letter-spacing: 0.06em;
    text-align: center;
  }

  /* Per-month tree visual — same SVG vocabulary as the kid view's hero,
     scaled down to share airtime with the data below it. Stage matches
     the family's actual growth at that point in their year (month 1 →
     seed; month 12 → mature with acorns). */
  .yr-slide-month, .yr-slide-best {
    justify-content: flex-start;
    padding-top: 56px;
    gap: 12px;
  }
  .yr-month-tree {
    width: 200px;
    align-self: center;
    margin-bottom: 8px;
    pointer-events: none;
  }
  .yr-month-tree svg { width: 100%; height: auto; display: block; }

  .yr-month-line {
    font-family: var(--serif); font-size: 22px;
    color: var(--ink-soft);
  }
  .yr-month-foot {
    font-family: var(--mono); font-size: 12px;
    color: var(--ink-muted); letter-spacing: 0.04em;
  }
  .yr-month-bar {
    margin-top: 28px; height: 8px;
    background: var(--stone-200); border-radius: 99px;
    overflow: hidden;
  }
  .yr-month-bar > span {
    display: block; height: 100%;
    background: linear-gradient(90deg, var(--green-600), var(--green-700));
    transition: width 600ms cubic-bezier(0.4, 0, 0.2, 1);
  }
  .yr-month-balance {
    font-family: var(--mono); font-size: 12px;
    color: var(--ink-muted); letter-spacing: 0.04em;
  }

  /* actions */
  .yr-actions {
    display: flex; gap: 10px; flex-wrap: wrap;
    margin-top: 8px;
    position: relative; z-index: 3;
  }
  .yr-btn {
    padding: 12px 18px;
    border-radius: 12px;
    font-family: var(--sans); font-size: 14px; font-weight: 500;
    cursor: pointer; letter-spacing: 0.02em;
    transition: all 140ms ease;
  }
  .yr-btn-primary {
    flex: 1; min-width: 140px;
    background: var(--green-700); color: var(--stone-50);
    border: none;
  }
  .yr-btn-primary:hover { background: var(--green-800); }
  .yr-btn-primary:disabled { opacity: 0.6; cursor: wait; }
  .yr-btn-quiet {
    background: var(--stone-50); color: var(--ink);
    border: 1px solid var(--stone-300);
  }
  .yr-btn-quiet:hover { border-color: var(--green-700); color: var(--green-700); }

  /* When the share preview is open, hide the stories chrome so its progress
     pips and close button don't bleed through the preview's translucent
     backdrop and overlap the preview modal's own close button. */
  .yr-stage-preview-open .yr-progress,
  .yr-stage-preview-open .yr-close { display: none; }

  /* Preview modal (over the stories overlay) */
  .yr-preview-overlay {
    position: fixed; inset: 0;
    background: rgba(31, 58, 42, 0.78);
    z-index: 80;
    display: flex; align-items: flex-end; justify-content: center;
    padding: 16px;
  }
  .yr-preview-sheet {
    position: relative;
    background: #FBF8F2;
    width: 100%; max-width: 440px;
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    border-radius: 24px 24px 0 0;
    padding: 22px 22px 28px;
    display: flex; flex-direction: column; gap: 14px;
    animation: yr-slide-up 280ms cubic-bezier(0.2, 0.8, 0.2, 1);
    box-shadow: 0 -20px 60px rgba(31, 58, 42, 0.18);
  }
  @keyframes yr-slide-up {
    from { transform: translateY(20px); opacity: 0; }
    to   { transform: translateY(0); opacity: 1; }
  }
  @media (min-width: 540px) {
    .yr-preview-overlay { align-items: center; }
    .yr-preview-sheet { border-radius: 24px; }
  }
  .yr-close-preview {
    top: 10px; right: 14px;
    background: transparent;
  }
  .yr-preview-img {
    display: block; width: 100%; height: auto;
    border-radius: 12px;
    border: 1px solid var(--stone-200);
  }
`;
