// Celebration helpers — confetti + count-up. Shared between
// distribute_monthly (gentle burst) and distribute_bonus (the 13th
// allowance — bigger, longer, the demo video's emotional climax).
//
// Uses canvas-confetti. Forest-green + amber palette to match brand.
//
// SSR note: canvas-confetti reaches into window/document. Import
// dynamically inside event handlers (or behind a "use client") so
// the bundle doesn't try to evaluate it server-side.

const SEEDLING_PALETTE = {
  green: ["#2E5C40", "#3A7050", "#4A8A65", "#9CB8A4"],
  amber: ["#F5D08A", "#F8DA9A", "#C9A24A"],
};

/** Leaf-colored burst at the deposit's destination — usually the family
 *  card itself so the visual ties to the row that just gained money.
 *  Caller passes a normalized [0..1] origin from getBoundingClientRect();
 *  defaults to upper-center if no rect supplied. */
export async function celebrateDeposit(
  origin: { x: number; y: number } = { x: 0.5, y: 0.4 }
): Promise<void> {
  const confetti = (await import("canvas-confetti")).default;
  confetti({
    particleCount: 140,
    spread: 100,
    startVelocity: 32,
    origin,
    colors: SEEDLING_PALETTE.green,
    scalar: 1.1,
    gravity: 1.0,
    ticks: 220,
  });
}

/** New-family celebration — "planting a seed". Two beats:
 *  1) a tight upward sprout from the card's center-bottom (low gravity,
 *     narrow spread, slow ticks → leaves drift UP rather than fall),
 *  2) a light amber sparkle 250ms later for the "first signs of growth"
 *     beat. Visually distinct from deposit (downward burst), withdraw
 *     (mixed harvest), monthly (single bottom puff), and bonus (cascade). */
export async function celebratePlant(
  origin: { x: number; y: number } = { x: 0.5, y: 0.7 }
): Promise<void> {
  const confetti = (await import("canvas-confetti")).default;
  // Stage 1 — upward sprout. Narrow spread, low gravity, high ticks so
  // particles linger and drift like rising leaves.
  confetti({
    particleCount: 70,
    angle: 90,
    spread: 55,
    startVelocity: 38,
    origin,
    colors: SEEDLING_PALETTE.green,
    scalar: 0.95,
    gravity: 0.55,
    ticks: 320,
  });
  // Stage 2 — amber sparkle, slightly above the sprout origin.
  setTimeout(() => {
    confetti({
      particleCount: 18,
      angle: 90,
      spread: 110,
      startVelocity: 18,
      origin: { x: origin.x, y: Math.max(0.05, origin.y - 0.1) },
      colors: SEEDLING_PALETTE.amber,
      scalar: 0.7,
      gravity: 0.5,
      ticks: 280,
    });
  }, 250);
}

/** Withdraw celebration — same shape as deposit but mixed green + amber
 *  to read as "harvest" rather than "planting". Slightly fewer particles
 *  so the two visuals are distinguishable side-by-side. */
export async function celebrateWithdraw(
  origin: { x: number; y: number } = { x: 0.5, y: 0.4 }
): Promise<void> {
  const confetti = (await import("canvas-confetti")).default;
  confetti({
    particleCount: 110,
    spread: 100,
    startVelocity: 30,
    origin,
    colors: [...SEEDLING_PALETTE.green, ...SEEDLING_PALETTE.amber],
    scalar: 1.05,
    gravity: 1.0,
    ticks: 220,
  });
}

export async function celebrateMonthly(): Promise<void> {
  const confetti = (await import("canvas-confetti")).default;
  // Single soft burst from the bottom, mostly green leaves.
  confetti({
    particleCount: 80,
    spread: 70,
    startVelocity: 35,
    origin: { x: 0.5, y: 0.85 },
    colors: SEEDLING_PALETTE.green,
    scalar: 0.9,
    ticks: 200,
  });
}

export async function celebrateBonus(): Promise<void> {
  const confetti = (await import("canvas-confetti")).default;
  // Three-stage cascade: gold burst + green burst + slow drift of
  // mixed colors. The "13th allowance harvest" beat.
  const goldEnd = Date.now() + 600;
  (function goldCannon() {
    confetti({
      particleCount: 6,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.7 },
      colors: SEEDLING_PALETTE.amber,
      scalar: 1.1,
    });
    confetti({
      particleCount: 6,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.7 },
      colors: SEEDLING_PALETTE.amber,
      scalar: 1.1,
    });
    if (Date.now() < goldEnd) requestAnimationFrame(goldCannon);
  })();

  setTimeout(() => {
    confetti({
      particleCount: 160,
      spread: 120,
      startVelocity: 45,
      origin: { x: 0.5, y: 0.7 },
      colors: [...SEEDLING_PALETTE.green, ...SEEDLING_PALETTE.amber],
      scalar: 1,
      ticks: 300,
    });
  }, 350);

  setTimeout(() => {
    confetti({
      particleCount: 50,
      spread: 180,
      startVelocity: 20,
      decay: 0.94,
      origin: { x: 0.5, y: 0.5 },
      colors: SEEDLING_PALETTE.amber,
      scalar: 0.7,
      gravity: 0.6,
      ticks: 400,
    });
  }, 900);
}
