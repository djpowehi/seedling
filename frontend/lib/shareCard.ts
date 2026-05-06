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
  monthLabel: string; // "April" / "Abril"
  guessUsd: number;
  actualUsd: number;
  goalLabel?: string; // "Nintendo Switch"
  goalProgressUsd?: number;
  goalTargetUsd?: number;
  /** Localized strings rendered into the PNG. Caller (PredictionCard)
   *  passes these through `t()`. Defaults to EN if omitted so legacy
   *  callers keep working. */
  labels?: {
    eyebrow: string; // already-rendered "APRIL · MARIA'S SEEDLING"
    myPrediction: string; // "my prediction" / "meu palpite"
    actual: string; // "actual" / "real"
    diffSpotOn: string; // "spot on." / "exato."
    diffOffBy: string; // already-rendered "off by 12¢."
    savingToward: string; // "SAVING TOWARD" / "GUARDANDO PARA"
  };
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

function diffWord(
  guess: number,
  actual: number,
  spotOn: string,
  offBy: string
): string {
  const diff = Math.abs(guess - actual);
  if (diff < 0.01) return spotOn;
  return offBy; // caller already substituted {cents} in
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
  // Localized eyebrow rendered into the PNG. Caller (PredictionCard) builds
  // the upper-cased version via t("share_card.eyebrow", { month, name }).
  // Falls back to the EN order if no labels passed (legacy callers).
  const eyebrow =
    data.labels?.eyebrow ??
    `${data.monthLabel.toUpperCase()} · ${data.kidName.toUpperCase()}'S SEEDLING`;
  ctx.fillText(eyebrow, PAD + 30, PAD);

  // ── headline: my prediction ──
  let y = PAD + 72;
  ctx.fillStyle = C.ink;
  ctx.font = "400 60px Iowan Old Style, Georgia, serif";
  ctx.fillText(data.labels?.myPrediction ?? "my prediction", PAD, y);

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
  ctx.fillText(data.labels?.actual ?? "actual", PAD, y);

  y += 78;
  ctx.fillStyle = C.green700;
  ctx.font = "italic 400 132px Iowan Old Style, Georgia, serif";
  ctx.fillText(fmtCents(data.actualUsd), PAD, y);

  // ── caption ──
  y += 168;
  ctx.fillStyle = C.inkSoft;
  ctx.font = "400 36px Iowan Old Style, Georgia, serif";
  ctx.fillText(
    diffWord(
      data.guessUsd,
      data.actualUsd,
      data.labels?.diffSpotOn ?? "spot on.",
      data.labels?.diffOffBy ??
        `off by ${Math.round(Math.abs(data.guessUsd - data.actualUsd) * 100)}¢.`
    ),
    PAD,
    y
  );

  // ── savings goal block (optional) ──
  if (data.goalLabel && data.goalTargetUsd && data.goalProgressUsd != null) {
    y += 96;
    ctx.fillStyle = C.inkMuted;
    ctx.font = "500 22px ui-monospace, JetBrains Mono, monospace";
    ctx.fillText(
      (data.labels?.savingToward ?? "saving toward").toUpperCase(),
      PAD,
      y
    );

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

/** Reports whether the runtime can hand the file to the OS share sheet
 *  (mobile + some desktop browsers). Use this to decide whether to render
 *  the "share" button at all — desktop browsers without canShare get a
 *  download-only experience instead of a share button that silently fails. */
export function canNativeShare(blob: Blob, filename: string): boolean {
  if (typeof navigator === "undefined") return false;
  if (
    typeof navigator.share !== "function" ||
    typeof navigator.canShare !== "function"
  ) {
    return false;
  }
  const file = new File([blob], filename, { type: "image/png" });
  return navigator.canShare({ files: [file] });
}

/** Hand the image to the OS share sheet. Returns false if share isn't
 *  available OR the user cancelled — caller can decide whether to fall
 *  back. Never triggers a download by itself. */
export async function shareImage(
  blob: Blob,
  filename: string
): Promise<boolean> {
  if (!canNativeShare(blob, filename)) return false;
  try {
    const file = new File([blob], filename, { type: "image/png" });
    await navigator.share({ files: [file] });
    return true;
  } catch {
    return false;
  }
}

/** Save the image to the user's downloads. Always works; no share sheet. */
export function downloadImage(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
