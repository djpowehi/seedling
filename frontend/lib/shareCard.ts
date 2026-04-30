// Generates a shareable PNG of the kid's monthly prediction-vs-actual card.
// Pure canvas API — no external deps. 1080×1350 (Instagram feed shape, also
// reads fine on iMessage / WhatsApp). Palette mirrors the kid view: stone
// background, forest serif, warm umber accents.
//
// The output is a Blob. The caller decides whether to:
//   - download it (anchor tag with object URL), or
//   - hand it to navigator.share (mobile native share sheet), or
//   - convert to data URL and stuff it into an <img>.

type ShareCardData = {
  kidName: string;
  monthLabel: string; // "April"
  guessUsd: number;
  actualUsd: number;
  goalLabel?: string; // "Nintendo Switch"
  goalProgressUsd?: number;
  goalTargetUsd?: number;
};

const W = 1080;
const H = 1350;
const PAD = 88;

// Palette (matches KidView's stone+forest system).
const C = {
  bg: "#FBF8F2",
  ink: "#2A2A22",
  inkSoft: "#4A4A3F",
  inkMuted: "#6F6A58",
  green900: "#1F3A2A",
  green700: "#2E5C40",
  green600: "#3A7050",
  stone200: "#ECE4D2",
  stone300: "#D9CFB8",
  amber: "#C5944A",
};

function fmtCents(d: number): string {
  return "$" + d.toFixed(2);
}

function diffWord(guess: number, actual: number): string {
  const diff = Math.abs(guess - actual);
  if (diff < 0.01) return "spot on.";
  const cents = Math.round(diff * 100);
  return `off by ${cents}¢.`;
}

export async function renderShareCard(data: ShareCardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  // ── background ──
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // soft radial wash for warmth
  const grad = ctx.createRadialGradient(
    W * 0.25,
    H * 0.18,
    50,
    W * 0.25,
    H * 0.18,
    W * 0.6
  );
  grad.addColorStop(0, "rgba(58, 112, 80, 0.06)");
  grad.addColorStop(1, "rgba(58, 112, 80, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // ── eyebrow row ──
  ctx.fillStyle = C.inkMuted;
  ctx.font = "500 26px ui-monospace, JetBrains Mono, monospace";
  ctx.textBaseline = "top";
  // green dot
  ctx.beginPath();
  ctx.arc(PAD + 8, PAD + 16, 7, 0, Math.PI * 2);
  ctx.fillStyle = C.green600;
  ctx.fill();
  ctx.fillStyle = C.inkMuted;
  const eyebrow = `${data.monthLabel.toUpperCase()} · ${data.kidName.toUpperCase()}'S SEEDLING`;
  ctx.fillText(eyebrow, PAD + 30, PAD);

  // ── headline: my prediction ──
  let y = PAD + 72;
  ctx.fillStyle = C.ink;
  ctx.font = "400 60px Iowan Old Style, Georgia, serif";
  ctx.fillText("my prediction", PAD, y);

  y += 78;
  ctx.fillStyle = C.green900;
  ctx.font = "400 132px Iowan Old Style, Georgia, serif";
  ctx.fillText(fmtCents(data.guessUsd), PAD, y);

  // ── divider ──
  y += 168;
  ctx.strokeStyle = C.stone300;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();

  // ── headline: actual ──
  y += 36;
  ctx.fillStyle = C.ink;
  ctx.font = "400 60px Iowan Old Style, Georgia, serif";
  ctx.fillText("actual", PAD, y);

  y += 78;
  ctx.fillStyle = C.green700;
  ctx.font = "italic 400 132px Iowan Old Style, Georgia, serif";
  ctx.fillText(fmtCents(data.actualUsd), PAD, y);

  // ── caption ──
  y += 168;
  ctx.fillStyle = C.inkSoft;
  ctx.font = "400 36px Iowan Old Style, Georgia, serif";
  ctx.fillText(diffWord(data.guessUsd, data.actualUsd), PAD, y);

  // ── savings goal block (optional) ──
  if (data.goalLabel && data.goalTargetUsd && data.goalProgressUsd != null) {
    y += 96;
    ctx.fillStyle = C.inkMuted;
    ctx.font = "500 22px ui-monospace, JetBrains Mono, monospace";
    ctx.fillText("SAVING TOWARD", PAD, y);

    y += 38;
    ctx.fillStyle = C.green900;
    ctx.font = "400 52px Iowan Old Style, Georgia, serif";
    ctx.fillText(data.goalLabel, PAD, y);

    // progress bar
    y += 82;
    const barW = W - PAD * 2;
    const barH = 12;
    ctx.fillStyle = C.stone200;
    ctx.beginPath();
    // simple rounded rect via arcs
    const r = barH / 2;
    ctx.moveTo(PAD + r, y);
    ctx.lineTo(PAD + barW - r, y);
    ctx.arc(PAD + barW - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(PAD + r, y + barH);
    ctx.arc(PAD + r, y + r, r, Math.PI / 2, -Math.PI / 2);
    ctx.fill();

    const pct = Math.min(1, data.goalProgressUsd / data.goalTargetUsd);
    if (pct > 0) {
      const fillW = Math.max(barH, barW * pct);
      ctx.fillStyle = C.green700;
      ctx.beginPath();
      ctx.moveTo(PAD + r, y);
      ctx.lineTo(PAD + fillW - r, y);
      ctx.arc(PAD + fillW - r, y + r, r, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(PAD + r, y + barH);
      ctx.arc(PAD + r, y + r, r, Math.PI / 2, -Math.PI / 2);
      ctx.fill();
    }

    y += 36;
    ctx.fillStyle = C.inkMuted;
    ctx.font = "400 24px ui-monospace, JetBrains Mono, monospace";
    ctx.fillText(
      `${fmtCents(data.goalProgressUsd)} / ${fmtCents(data.goalTargetUsd)}`,
      PAD,
      y
    );
  }

  // ── footer wordmark ──
  ctx.fillStyle = C.green900;
  ctx.font = "400 38px Iowan Old Style, Georgia, serif";
  ctx.fillText("seedling", PAD, H - PAD - 4);

  ctx.fillStyle = C.inkMuted;
  ctx.font = "500 22px ui-monospace, JetBrains Mono, monospace";
  ctx.textAlign = "right";
  ctx.fillText("seedlingsol.xyz", W - PAD, H - PAD + 8);
  ctx.textAlign = "left"; // reset

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png"
    );
  });
}

/** Trigger native share sheet on mobile, fall back to download on desktop. */
export async function shareOrDownload(
  blob: Blob,
  filename: string
): Promise<void> {
  const file = new File([blob], filename, { type: "image/png" });
  // navigator.share with files only works on mobile + some desktop browsers.
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }
  // Download fallback.
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
