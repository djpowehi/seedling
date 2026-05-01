// Year-recap share card. Single tall PNG that summarizes the year:
// hero headline, 12-bar sparkline of monthly yields, best-month
// callout, totals + percentage, footer. 1080 × 1920 (Instagram story
// shape — fits all phone share sheets cleanly + reads as a vertical
// scroll on desktop).

import type { YearRecap } from "@/lib/yearRecap";

const W = 1080;
const H = 1920;
const PAD = 88;

const C = {
  bg: "#FBF8F2",
  ink: "#2A2A22",
  inkSoft: "#4A4A3F",
  inkMuted: "#6F6A58",
  green900: "#1F3A2A",
  green800: "#244A33",
  green700: "#2E5C40",
  green600: "#3A7050",
  stone200: "#ECE4D2",
  stone300: "#D9CFB8",
  amber: "#C5944A",
};

function fmtUsd(v: number): string {
  if (v < 1) return "$" + v.toFixed(2);
  if (v < 100) return "$" + v.toFixed(2);
  return "$" + Math.round(v).toLocaleString();
}

type ShareData = {
  kidName: string;
  recap: YearRecap;
};

export async function renderYearShareCard(data: ShareData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  // ── background + soft wash ──
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);
  const grad = ctx.createRadialGradient(
    W * 0.7,
    H * 0.1,
    60,
    W * 0.7,
    H * 0.1,
    W
  );
  grad.addColorStop(0, "rgba(58, 112, 80, 0.08)");
  grad.addColorStop(1, "rgba(58, 112, 80, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  // Header band — eyebrow chip + dot
  let y = PAD;
  ctx.beginPath();
  ctx.arc(PAD + 8, y + 16, 7, 0, Math.PI * 2);
  ctx.fillStyle = C.green600;
  ctx.fill();
  ctx.fillStyle = C.inkMuted;
  ctx.font = "500 24px ui-monospace, JetBrains Mono, monospace";
  // Compose header from the actual recap window so a family that started
  // mid-year reads as e.g. "AUG 2025 → JUL 2026 · MARIA'S YEAR".
  const startYr = data.recap.startCycleKey.slice(0, 4);
  const endYr = data.recap.endCycleKey.slice(0, 4);
  const header =
    startYr === endYr
      ? `${startYr} · ${data.kidName.toUpperCase()}'S SEEDLING YEAR`
      : `${startYr}–${endYr} · ${data.kidName.toUpperCase()}'S SEEDLING YEAR`;
  ctx.fillText(header, PAD + 30, y);

  // ── headline (two-line serif) ──
  y = PAD + 78;
  ctx.fillStyle = C.green900;
  ctx.font = "400 132px Iowan Old Style, Georgia, serif";
  ctx.fillText("a year of", PAD, y);
  y += 132;

  ctx.fillStyle = C.green700;
  ctx.font = "italic 400 132px Iowan Old Style, Georgia, serif";
  ctx.fillText("growing.", PAD, y);
  y += 132 + 100; // headline + generous breathing room (the "growing."
  // descender + the "MONTH BY MONTH" eyebrow were crowding each other on
  // mobile renders; we have ~280px of slack at the bottom anyway).

  // ── monthly sparkline ──
  ctx.fillStyle = C.inkMuted;
  ctx.font = "500 22px ui-monospace, JetBrains Mono, monospace";
  ctx.fillText("MONTH BY MONTH", PAD, y);
  y += 30;
  ctx.fillStyle = C.inkSoft;
  ctx.font = "italic 400 30px Iowan Old Style, Georgia, serif";
  ctx.fillText("monthly yield", PAD, y);
  y += 38;

  const chartTop = y;
  const chartH = 320;
  const chartBottom = chartTop + chartH;
  const chartLeft = PAD;
  const chartRight = W - PAD;
  const chartW = chartRight - chartLeft;

  const maxYield = Math.max(...data.recap.months.map((m) => m.yieldUsd), 0.01);
  const barGap = 8;
  const barW = (chartW - barGap * 11) / 12;

  // baseline
  ctx.strokeStyle = C.stone300;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(chartLeft, chartBottom);
  ctx.lineTo(chartRight, chartBottom);
  ctx.stroke();

  data.recap.months.forEach((m, i) => {
    const x = chartLeft + i * (barW + barGap);
    const barH = Math.max(6, (m.yieldUsd / maxYield) * (chartH - 50));
    const top = chartBottom - barH;

    // bar with rounded top
    ctx.fillStyle = C.green700;
    ctx.beginPath();
    const r = Math.min(8, barW / 2);
    ctx.moveTo(x, chartBottom);
    ctx.lineTo(x, top + r);
    ctx.arcTo(x, top, x + r, top, r);
    ctx.lineTo(x + barW - r, top);
    ctx.arcTo(x + barW, top, x + barW, top + r, r);
    ctx.lineTo(x + barW, chartBottom);
    ctx.closePath();
    ctx.fill();

    // month abbrev underneath
    ctx.fillStyle = C.inkMuted;
    ctx.font = "500 16px ui-monospace, JetBrains Mono, monospace";
    ctx.textAlign = "center";
    ctx.fillText(m.monthShort.toUpperCase(), x + barW / 2, chartBottom + 14);
    ctx.textAlign = "left";
  });

  y = chartBottom + 56;

  // ── best month callout ──
  ctx.fillStyle = C.inkMuted;
  ctx.font = "500 22px ui-monospace, JetBrains Mono, monospace";
  ctx.fillText("BEST MONTH", PAD, y);
  y += 36;

  ctx.fillStyle = C.green900;
  ctx.font = "400 56px Iowan Old Style, Georgia, serif";
  ctx.fillText(
    `${data.recap.bestMonth.monthLabel} · ${fmtUsd(
      data.recap.bestMonth.yieldUsd
    )}`,
    PAD,
    y
  );
  y += 56 + 8;
  ctx.fillStyle = C.inkSoft;
  ctx.font = "400 26px Iowan Old Style, Georgia, serif";
  ctx.fillText(
    `at ${(data.recap.bestMonth.apyEffectiveBps / 100).toFixed(1)}% APY`,
    PAD,
    y
  );
  y += 26 + 56;

  // ── totals stack ──
  ctx.fillStyle = C.inkMuted;
  ctx.font = "500 22px ui-monospace, JetBrains Mono, monospace";
  ctx.fillText("YOU PUT IN", PAD, y);
  y += 30;
  ctx.fillStyle = C.ink;
  ctx.font = "400 80px Iowan Old Style, Georgia, serif";
  ctx.fillText(fmtUsd(data.recap.totalDepositedUsd), PAD, y);
  y += 80 + 36;

  ctx.fillStyle = C.inkMuted;
  ctx.font = "500 22px ui-monospace, JetBrains Mono, monospace";
  ctx.fillText("YOUR SAVINGS EARNED", PAD, y);
  y += 30;
  ctx.fillStyle = C.green700;
  ctx.font = "italic 400 116px Iowan Old Style, Georgia, serif";
  ctx.fillText(fmtUsd(data.recap.totalYieldedUsd), PAD, y);
  y += 116 + 36;

  ctx.fillStyle = C.inkMuted;
  ctx.font = "500 22px ui-monospace, JetBrains Mono, monospace";
  ctx.fillText("THAT'S", PAD, y);
  y += 30;
  ctx.fillStyle = C.amber;
  ctx.font = "400 88px Iowan Old Style, Georgia, serif";
  ctx.fillText(`+${data.recap.percentGrowth.toFixed(2)}%`, PAD, y);
  y += 88 + 8;
  ctx.fillStyle = C.inkSoft;
  ctx.font = "400 28px Iowan Old Style, Georgia, serif";
  ctx.fillText("growth, just by waiting.", PAD, y);

  // ── footer wordmark (positioned absolutely from bottom) ──
  const footerY = H - PAD;
  ctx.fillStyle = C.green900;
  ctx.font = "400 38px Iowan Old Style, Georgia, serif";
  ctx.fillText("seedling", PAD, footerY);

  ctx.fillStyle = C.inkMuted;
  ctx.font = "500 22px ui-monospace, JetBrains Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText("seedlingsol.xyz", W - PAD, footerY + 8);
  ctx.textAlign = "left";

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
}
