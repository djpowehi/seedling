// Hand-drawn young oak — 12 monthly growth stages + bonus-ready celebration.
// Source: Claude Design pass on Day 11. Same pot vocabulary, palette, and
// stroke weights as the landing's hero seedling. Stages plotted on the
// SAME viewBox (0..460), trunk centered at x≈230, soil line at y=300.

const POT_COLORS = {
  body: "#ECE4D2",
  shade: "#D9CFB8",
  edge: "#5A4A36",
  // Lightened from #4A3A28 (dark chocolate) — the dark soil read as
  // "dirt overflowing the pot" against the calm beige palette. Warm umber
  // sits inside the rim instead of dominating it.
  soil: "#7B6750",
};
const LEAF = {
  dark: "#1F3A2A",
  mid: "#2E5C40",
  warm: "#3A7050",
  light: "#4A8A65",
  pale: "#9CB8A4",
  bud: "#4A8A65",
};

const MONTH_SECONDS = 30 * 86_400;

/**
 * Stage by months elapsed since the family was created on chain.
 * Caps at 12 (month 11+ → mature with acorns/flowers). The bonus-ready
 * celebration is a SEPARATE state, not a stage; see KidView.
 */
export function stageForMonths(monthsElapsed: number): Stage {
  const s = Math.max(1, Math.min(12, Math.floor(monthsElapsed) + 1));
  return s as Stage;
}

export function monthsSince(createdAtSec: number, nowSec: number): number {
  return Math.max(0, (nowSec - createdAtSec) / MONTH_SECONDS);
}

export type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

// ───── shared chrome ─────

function Pot() {
  return (
    <g>
      <ellipse cx="230" cy="378" rx="76" ry="3.5" fill="#000" opacity="0.07" />
      <path
        d="M170 300 L 290 300 L 282 360 C 280 372, 264 376, 230 376 C 196 376, 180 372, 178 360 Z"
        fill={POT_COLORS.body}
        stroke={POT_COLORS.edge}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M178 360 C 180 372, 196 376, 230 376 C 264 376, 280 372, 282 360 L 281 348 C 277 356, 261 360, 230 360 C 199 360, 183 356, 179 348 Z"
        fill={POT_COLORS.shade}
        opacity="0.85"
      />
      <path
        d="M162 298 L 298 298 L 292 312 L 168 312 Z"
        fill={POT_COLORS.shade}
        stroke={POT_COLORS.edge}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/*
        Soil — flatter (ry 4.5 → 2.5) and narrower (rx 62 → 56) so its top
        edge sits right at the pot's body-opening line (y=300) instead of
        rising 2.5px above it. Mound dropped entirely; the seed/trunk in
        each stage already implies the dirt level, so the mound was just
        adding visual weight that competed with the rim.
      */}
      <ellipse cx="230" cy="302" rx="56" ry="2.5" fill={POT_COLORS.soil} />
      <circle cx="210" cy="301" r="1.1" fill={POT_COLORS.edge} opacity="0.4" />
      <circle cx="246" cy="302" r="0.9" fill={POT_COLORS.edge} opacity="0.35" />
      <circle cx="256" cy="301" r="0.8" fill={POT_COLORS.edge} opacity="0.35" />
      <circle cx="218" cy="302" r="0.8" fill={POT_COLORS.edge} opacity="0.3" />
    </g>
  );
}

function Ground() {
  return (
    <>
      <path
        d="M40 410 Q230 398 420 410"
        fill="none"
        stroke="#D9CFB8"
        strokeWidth="1"
        opacity="0.7"
      />
      <path
        d="M70 420 Q230 412 390 420"
        fill="none"
        stroke="#D9CFB8"
        strokeWidth="1"
        opacity="0.4"
      />
    </>
  );
}

function OakLeaf({
  x,
  y,
  rot = 0,
  scale = 1,
  fill = LEAF.mid,
  vein = LEAF.dark,
}: {
  x: number;
  y: number;
  rot?: number;
  scale?: number;
  fill?: string;
  vein?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale})`}>
      <path
        d="M0 0 C -2 -4, -6 -6, -8 -10 C -10 -14, -7 -16, -4 -14 C -3 -17, -8 -20, -6 -24 C -3 -26, -1 -22, 0 -20 C 1 -22, 3 -26, 6 -24 C 8 -20, 3 -17, 4 -14 C 7 -16, 10 -14, 8 -10 C 6 -6, 2 -4, 0 0 Z"
        fill={fill}
      />
      <path d="M0 0 V -22" stroke={vein} strokeWidth="0.5" opacity="0.55" />
    </g>
  );
}

function Acorn({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <ellipse cx="0" cy="2" rx="2.4" ry="3" fill="#8A5A2E" />
      <path d="M-2.6 0 A 2.6 1.6 0 0 1 2.6 0 Z" fill="#5A3A1E" />
      <circle cx="0" cy="-1" r="0.5" fill="#5A3A1E" />
    </g>
  );
}

function Flower({
  x,
  y,
  open = true,
}: {
  x: number;
  y: number;
  open?: boolean;
}) {
  if (!open) {
    return <circle cx={x} cy={y} r="1.4" fill="#C9A24A" opacity="0.85" />;
  }
  return (
    <g>
      <circle cx={x} cy={y} r="2.6" fill="#F5D08A" />
      <circle cx={x} cy={y} r="1" fill="#8A5A2E" />
    </g>
  );
}

type LeafSpec = [number, number, number, number, string];
const renderLeaves = (specs: LeafSpec[]) =>
  specs.map(([x, y, r, s, f], i) => (
    <OakLeaf key={i} x={x} y={y} rot={r} scale={s} fill={f} />
  ));

// ───── stages ─────

function Stage1() {
  return (
    <g>
      <ellipse cx="230" cy="298" rx="5" ry="3.2" fill="#5A4A36" />
      <path
        d="M227 297 C 229 295, 231 295, 233 297"
        fill="none"
        stroke="#3A2D1E"
        strokeWidth="0.7"
        strokeLinecap="round"
      />
      <path
        d="M230 296 V 292"
        stroke={LEAF.warm}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="252" cy="270" r="1.4" fill={LEAF.pale} opacity="0.7" />
      <circle cx="208" cy="258" r="1.1" fill={LEAF.pale} opacity="0.5" />
    </g>
  );
}

function Stage2() {
  return (
    <g className="kv-sway">
      <path
        d="M230 300 C 228 282, 234 264, 230 246"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M230 252 C 212 246, 192 244, 180 232 C 184 220, 204 218, 220 226 C 226 232, 230 244, 230 252 Z"
        fill={LEAF.mid}
      />
      <path
        d="M230 252 C 218 244, 204 238, 188 230"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="0.8"
        opacity="0.55"
      />
      <path
        d="M230 252 C 248 246, 268 244, 282 232 C 278 220, 258 218, 240 226 C 234 232, 230 244, 230 252 Z"
        fill={LEAF.warm}
      />
      <path
        d="M230 252 C 244 244, 258 238, 274 230"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="0.8"
        opacity="0.55"
      />
      <path
        d="M230 246 C 226 240, 226 234, 230 230 C 234 234, 234 240, 230 246 Z"
        fill={LEAF.bud}
      />
    </g>
  );
}

function Stage3() {
  return (
    <g className="kv-sway">
      <path
        d="M230 300 C 228 280, 234 256, 230 226"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M230 246 C 216 242, 200 240, 188 232 C 192 224, 208 224, 220 230 C 226 234, 230 242, 230 246 Z"
        fill={LEAF.warm}
        opacity="0.85"
      />
      <path
        d="M230 246 C 244 242, 260 240, 272 232 C 268 224, 252 224, 240 230 C 234 234, 230 242, 230 246 Z"
        fill={LEAF.mid}
        opacity="0.85"
      />
      <OakLeaf x={222} y={228} rot={-25} scale={0.85} fill={LEAF.mid} />
      <OakLeaf x={238} y={228} rot={25} scale={0.85} fill={LEAF.warm} />
      <path
        d="M230 226 C 226 220, 226 214, 230 210 C 234 214, 234 220, 230 226 Z"
        fill={LEAF.bud}
      />
    </g>
  );
}

function Stage4() {
  return (
    <g className="kv-sway">
      <path
        d="M230 300 C 228 274, 234 244, 230 210"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M230 300 C 228 274, 234 244, 230 210"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <OakLeaf x={216} y={222} rot={-30} scale={1} fill={LEAF.warm} />
      <OakLeaf x={244} y={222} rot={30} scale={1} fill={LEAF.mid} />
      <OakLeaf x={222} y={208} rot={-15} scale={1.1} fill={LEAF.mid} />
      <OakLeaf x={238} y={208} rot={15} scale={1.1} fill={LEAF.warm} />
      <OakLeaf x={230} y={196} rot={0} scale={1.2} fill={LEAF.dark} />
    </g>
  );
}

function Stage5() {
  return (
    <g className="kv-sway">
      <path
        d="M230 300 C 228 264, 234 222, 230 174"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M230 300 C 228 264, 234 222, 230 174"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M232 234 C 218 230, 204 224, 192 216"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <OakLeaf x={192} y={216} rot={-60} scale={1} fill={LEAF.warm} />
      <OakLeaf x={204} y={216} rot={-40} scale={0.95} fill={LEAF.mid} />
      <OakLeaf x={222} y={184} rot={-20} scale={1.05} fill={LEAF.warm} />
      <OakLeaf x={238} y={184} rot={20} scale={1.05} fill={LEAF.mid} />
      <OakLeaf x={230} y={172} rot={0} scale={1.2} fill={LEAF.dark} />
      <OakLeaf x={216} y={196} rot={-30} scale={0.9} fill={LEAF.mid} />
    </g>
  );
}

function Stage6() {
  return (
    <g className="kv-sway">
      <path
        d="M230 300 C 228 260, 234 216, 230 168"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M230 300 C 228 260, 234 216, 230 168"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M231 232 C 216 226, 200 220, 188 212"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M231 218 C 246 212, 262 206, 274 198"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <OakLeaf x={188} y={212} rot={-65} scale={1} fill={LEAF.warm} />
      <OakLeaf x={200} y={210} rot={-45} scale={0.95} fill={LEAF.mid} />
      <OakLeaf x={212} y={206} rot={-30} scale={0.9} fill={LEAF.warm} />
      <OakLeaf x={274} y={198} rot={65} scale={1} fill={LEAF.warm} />
      <OakLeaf x={262} y={196} rot={45} scale={0.95} fill={LEAF.mid} />
      <OakLeaf x={250} y={194} rot={30} scale={0.9} fill={LEAF.warm} />
      <OakLeaf x={222} y={180} rot={-15} scale={1.1} fill={LEAF.mid} />
      <OakLeaf x={238} y={180} rot={15} scale={1.1} fill={LEAF.warm} />
      <OakLeaf x={230} y={166} rot={0} scale={1.25} fill={LEAF.dark} />
    </g>
  );
}

function Stage7() {
  return (
    <g className="kv-sway">
      <path
        d="M230 300 C 228 250, 234 198, 230 138"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <path
        d="M230 300 C 228 250, 234 198, 230 138"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M231 232 C 216 226, 200 220, 188 212"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M231 208 C 246 202, 262 196, 274 188"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M229 184 C 218 174, 210 164, 204 154"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M231 172 C 240 162, 248 152, 254 142"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <OakLeaf x={188} y={212} rot={-65} scale={1} fill={LEAF.warm} />
      <OakLeaf x={200} y={208} rot={-45} scale={1.05} fill={LEAF.mid} />
      <OakLeaf x={274} y={188} rot={65} scale={1} fill={LEAF.warm} />
      <OakLeaf x={262} y={186} rot={45} scale={1.05} fill={LEAF.mid} />
      <OakLeaf x={204} y={154} rot={-30} scale={1.1} fill={LEAF.warm} />
      <OakLeaf x={214} y={146} rot={-15} scale={1.15} fill={LEAF.mid} />
      <OakLeaf x={254} y={142} rot={30} scale={1.1} fill={LEAF.warm} />
      <OakLeaf x={246} y={138} rot={15} scale={1.15} fill={LEAF.mid} />
      <OakLeaf x={230} y={132} rot={0} scale={1.3} fill={LEAF.dark} />
      <OakLeaf x={222} y={154} rot={-12} scale={1} fill={LEAF.warm} />
      <OakLeaf x={238} y={154} rot={12} scale={1} fill={LEAF.mid} />
    </g>
  );
}

function Stage8() {
  return (
    <g className="kv-sway">
      <path
        d="M229 300 C 227 250, 234 198, 230 134"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="3.6"
        strokeLinecap="round"
      />
      <path
        d="M229 300 C 227 250, 234 198, 230 134"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="1.8"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M231 232 C 216 226, 200 220, 188 212"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M231 208 C 246 202, 262 196, 274 188"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M229 184 C 218 174, 210 164, 204 154"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M231 172 C 240 162, 248 152, 254 142"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <OakLeaf x={188} y={212} rot={-65} scale={1.05} fill={LEAF.warm} />
      <OakLeaf x={198} y={210} rot={-50} scale={1.1} fill={LEAF.mid} />
      <OakLeaf x={210} y={206} rot={-35} scale={1.1} fill={LEAF.dark} />
      <OakLeaf x={220} y={210} rot={-20} scale={1} fill={LEAF.warm} />
      <OakLeaf x={274} y={188} rot={65} scale={1.05} fill={LEAF.warm} />
      <OakLeaf x={264} y={186} rot={50} scale={1.1} fill={LEAF.mid} />
      <OakLeaf x={252} y={184} rot={35} scale={1.1} fill={LEAF.dark} />
      <OakLeaf x={242} y={188} rot={20} scale={1} fill={LEAF.warm} />
      <OakLeaf x={204} y={154} rot={-30} scale={1.1} fill={LEAF.warm} />
      <OakLeaf x={214} y={148} rot={-18} scale={1.2} fill={LEAF.mid} />
      <OakLeaf x={222} y={144} rot={-8} scale={1.1} fill={LEAF.warm} />
      <OakLeaf x={254} y={142} rot={30} scale={1.1} fill={LEAF.warm} />
      <OakLeaf x={244} y={136} rot={18} scale={1.2} fill={LEAF.mid} />
      <OakLeaf x={236} y={134} rot={8} scale={1.1} fill={LEAF.warm} />
      <OakLeaf x={230} y={128} rot={0} scale={1.4} fill={LEAF.dark} />
      <OakLeaf x={216} y={170} rot={-15} scale={1.05} fill={LEAF.mid} />
      <OakLeaf x={244} y={170} rot={15} scale={1.05} fill={LEAF.warm} />
      <OakLeaf x={230} y={158} rot={0} scale={1} fill={LEAF.warm} />
      <OakLeaf x={222} y={188} rot={-25} scale={0.95} fill={LEAF.mid} />
      <OakLeaf x={238} y={188} rot={25} scale={0.95} fill={LEAF.warm} />
      <OakLeaf x={230} y={196} rot={0} scale={0.9} fill={LEAF.warm} />
    </g>
  );
}

const STAGE9_LEAVES: LeafSpec[] = [
  [164, 208, -70, 1.1, LEAF.warm],
  [180, 202, -55, 1.15, LEAF.mid],
  [196, 194, -40, 1.2, LEAF.dark],
  [212, 188, -25, 1.25, LEAF.warm],
  [296, 184, 70, 1.1, LEAF.warm],
  [280, 178, 55, 1.15, LEAF.mid],
  [264, 172, 40, 1.2, LEAF.dark],
  [248, 166, 25, 1.25, LEAF.warm],
  [196, 132, -30, 1.2, LEAF.warm],
  [206, 122, -18, 1.3, LEAF.mid],
  [218, 114, -8, 1.35, LEAF.dark],
  [266, 122, 30, 1.2, LEAF.warm],
  [256, 114, 18, 1.3, LEAF.mid],
  [244, 108, 8, 1.35, LEAF.dark],
  [230, 104, 0, 1.45, LEAF.dark],
  [220, 138, -15, 1.1, LEAF.warm],
  [240, 138, 15, 1.1, LEAF.mid],
  [230, 150, 0, 1.05, LEAF.warm],
  [212, 164, -22, 1, LEAF.mid],
  [248, 164, 22, 1, LEAF.warm],
  [230, 182, 0, 1, LEAF.warm],
];

function Stage9() {
  return (
    <g className="kv-sway">
      <path
        d="M229 300 C 226 254, 234 200, 230 128"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M229 300 C 226 254, 234 200, 230 128"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M229 232 C 206 224, 184 216, 164 208"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M231 208 C 254 200, 276 192, 296 184"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M229 178 C 216 162, 204 146, 196 132"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M231 168 C 246 152, 258 136, 266 122"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M180 216 C 174 210, 170 202, 168 196"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M280 192 C 286 186, 288 178, 290 172"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {renderLeaves(STAGE9_LEAVES)}
    </g>
  );
}

const STAGE10_LEAVES: LeafSpec[] = [
  [144, 200, -70, 1.15, LEAF.warm],
  [160, 188, -55, 1.25, LEAF.mid],
  [178, 178, -40, 1.3, LEAF.dark],
  [196, 168, -25, 1.4, LEAF.warm],
  [214, 160, -15, 1.4, LEAF.mid],
  [316, 176, 70, 1.15, LEAF.warm],
  [298, 166, 55, 1.25, LEAF.mid],
  [280, 156, 40, 1.3, LEAF.dark],
  [262, 148, 25, 1.4, LEAF.warm],
  [246, 140, 15, 1.4, LEAF.mid],
  [188, 116, -30, 1.2, LEAF.dark],
  [200, 102, -15, 1.3, LEAF.warm],
  [214, 92, -5, 1.4, LEAF.mid],
  [274, 100, 30, 1.2, LEAF.dark],
  [262, 90, 15, 1.3, LEAF.warm],
  [248, 84, 5, 1.4, LEAF.mid],
  [230, 80, 0, 1.5, LEAF.dark],
  [220, 114, -15, 1.15, LEAF.warm],
  [242, 114, 15, 1.15, LEAF.mid],
  [230, 128, 0, 1.1, LEAF.warm],
  [208, 134, -25, 1, LEAF.mid],
  [254, 134, 25, 1, LEAF.warm],
  [230, 170, 0, 1.05, LEAF.warm],
  [212, 184, -20, 0.95, LEAF.mid],
  [248, 184, 20, 0.95, LEAF.warm],
  [194, 150, -35, 1, LEAF.mid],
  [266, 150, 35, 1, LEAF.warm],
  [220, 150, -10, 0.95, LEAF.warm],
  [240, 150, 10, 0.95, LEAF.mid],
];

function Stage10() {
  return (
    <g className="kv-sway">
      <path
        d="M226 300 C 222 250, 234 198, 230 116"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      <path
        d="M226 300 C 222 250, 234 198, 230 116"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M214 300 C 218 292, 222 290, 224 294"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M236 300 C 232 292, 228 290, 226 294"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M242 300 C 238 296, 232 294, 230 296"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M218 300 C 222 296, 228 294, 230 296"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M229 224 C 200 214, 170 206, 144 200"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M231 200 C 260 192, 290 184, 316 176"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M229 168 C 212 152, 198 132, 188 116"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M231 156 C 248 138, 262 118, 274 100"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M230 144 C 230 128, 232 112, 230 96"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {renderLeaves(STAGE10_LEAVES)}
    </g>
  );
}

const STAGE11_LEAVES: LeafSpec[] = [
  [142, 198, -70, 1.2, LEAF.warm],
  [158, 186, -55, 1.3, LEAF.mid],
  [176, 176, -40, 1.35, LEAF.dark],
  [194, 166, -25, 1.45, LEAF.warm],
  [214, 158, -15, 1.45, LEAF.mid],
  [318, 172, 70, 1.2, LEAF.warm],
  [300, 162, 55, 1.3, LEAF.mid],
  [282, 152, 40, 1.35, LEAF.dark],
  [264, 144, 25, 1.45, LEAF.warm],
  [246, 138, 15, 1.45, LEAF.mid],
  [186, 108, -30, 1.25, LEAF.dark],
  [198, 94, -15, 1.35, LEAF.warm],
  [212, 84, -5, 1.45, LEAF.mid],
  [276, 92, 30, 1.25, LEAF.dark],
  [264, 82, 15, 1.35, LEAF.warm],
  [250, 76, 5, 1.45, LEAF.mid],
  [230, 72, 0, 1.55, LEAF.dark],
  [220, 108, -15, 1.2, LEAF.warm],
  [242, 108, 15, 1.2, LEAF.mid],
  [230, 122, 0, 1.15, LEAF.warm],
  [206, 128, -25, 1, LEAF.mid],
  [256, 128, 25, 1, LEAF.warm],
  [230, 164, 0, 1.05, LEAF.warm],
  [212, 180, -20, 1, LEAF.mid],
  [248, 180, 20, 1, LEAF.warm],
  [192, 144, -35, 1, LEAF.mid],
  [268, 144, 35, 1, LEAF.warm],
  [220, 144, -10, 0.95, LEAF.warm],
  [240, 144, 10, 0.95, LEAF.mid],
];

const STAGE11_BUDS: Array<[number, number]> = [
  [210, 130],
  [254, 130],
  [228, 116],
  [200, 152],
  [262, 152],
  [232, 100],
];

function Stage11() {
  return (
    <g className="kv-sway">
      <path
        d="M226 300 C 222 248, 234 196, 230 110"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="4.8"
        strokeLinecap="round"
      />
      <path
        d="M226 300 C 222 248, 234 196, 230 110"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M212 300 C 218 290, 222 290, 224 294"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M238 300 C 232 290, 228 290, 226 294"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M222 270 C 224 264, 222 258, 224 252"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="0.7"
        opacity="0.55"
      />
      <path
        d="M228 230 C 226 224, 228 218, 226 212"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="0.7"
        opacity="0.55"
      />
      <path
        d="M228 224 C 198 212, 168 204, 142 198"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M231 198 C 262 188, 292 180, 318 172"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M229 162 C 212 144, 198 124, 186 108"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M231 150 C 248 132, 262 112, 276 92"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <path
        d="M230 138 C 230 122, 232 106, 230 90"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      {renderLeaves(STAGE11_LEAVES)}
      {STAGE11_BUDS.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="3.6" fill="#F5D08A" opacity="0.5" />
          <ellipse cx={x} cy={y - 1} rx="2.4" ry="3" fill="#F5D08A" />
          <ellipse
            cx={x - 0.6}
            cy={y - 1.6}
            rx="0.9"
            ry="1.4"
            fill="#FAE3B0"
            opacity="0.85"
          />
          <path
            d={`M${x - 2.4} ${y + 1.6} Q ${x} ${y + 0.4}, ${x + 2.4} ${
              y + 1.6
            }`}
            fill="none"
            stroke={LEAF.dark}
            strokeWidth="0.7"
          />
        </g>
      ))}
    </g>
  );
}

const STAGE12_LEAVES: LeafSpec[] = [
  [144, 200, -70, 1.2, LEAF.warm],
  [160, 188, -55, 1.3, LEAF.mid],
  [178, 178, -40, 1.35, LEAF.dark],
  [196, 168, -25, 1.45, LEAF.warm],
  [214, 160, -15, 1.45, LEAF.mid],
  [314, 172, 70, 1.2, LEAF.warm],
  [296, 162, 55, 1.3, LEAF.mid],
  [278, 154, 40, 1.35, LEAF.dark],
  [262, 146, 25, 1.45, LEAF.warm],
  [246, 140, 15, 1.45, LEAF.mid],
  [182, 116, -30, 1.25, LEAF.dark],
  [196, 100, -15, 1.35, LEAF.warm],
  [210, 90, -5, 1.45, LEAF.mid],
  [282, 100, 30, 1.25, LEAF.dark],
  [268, 90, 15, 1.35, LEAF.warm],
  [254, 82, 5, 1.45, LEAF.mid],
  [232, 80, 0, 1.55, LEAF.dark],
  [220, 114, -15, 1.2, LEAF.warm],
  [244, 114, 15, 1.2, LEAF.mid],
  [232, 128, 0, 1.15, LEAF.warm],
  [206, 132, -25, 1, LEAF.mid],
  [256, 132, 25, 1, LEAF.warm],
  [228, 170, 0, 1.05, LEAF.warm],
  [210, 190, -20, 1, LEAF.mid],
  [248, 190, 20, 1, LEAF.warm],
  [186, 144, -35, 1, LEAF.mid],
  [272, 144, 35, 1, LEAF.warm],
];

function Stage12() {
  return (
    <g>
      <circle cx="230" cy="150" r="120" fill="#F5D08A" opacity="0.10" />
      <circle cx="230" cy="150" r="90" fill="#F5D08A" opacity="0.08" />
      <g className="kv-sway">
        <path
          d="M222 300 C 218 248, 232 200, 232 134"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="6"
          strokeLinecap="round"
        />
        <path
          d="M222 300 C 218 248, 232 200, 232 134"
          fill="none"
          stroke={LEAF.warm}
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path
          d="M220 270 C 222 264, 220 258, 222 252"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="0.7"
          opacity="0.6"
        />
        <path
          d="M226 234 C 224 228, 226 222, 224 216"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="0.7"
          opacity="0.6"
        />
        <path
          d="M230 200 C 228 194, 230 188, 228 182"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="0.7"
          opacity="0.6"
        />
        <path
          d="M210 300 C 216 290, 222 288, 224 292"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M240 300 C 234 290, 228 288, 226 292"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M225 230 C 198 218, 170 210, 144 200"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <path
          d="M232 204 C 260 192, 290 184, 314 172"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <path
          d="M229 172 C 212 154, 196 134, 182 116"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M232 158 C 250 138, 268 120, 282 100"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M232 146 C 232 130, 234 114, 232 98"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        {renderLeaves(STAGE12_LEAVES)}
        <Acorn x={200} y={156} />
        <Acorn x={248} y={148} />
        <Acorn x={232} y={120} />
        <Acorn x={270} y={170} />
        <Acorn x={190} y={178} />
        <Acorn x={218} y={142} />
        <Acorn x={258} y={124} />
        <Flower x={216} y={108} />
        <Flower x={246} y={102} />
        <Flower x={228} y={92} />
        <Flower x={264} y={144} />
        <Flower x={196} y={130} />
        <Flower x={236} y={154} />
        <OakLeaf x={332} y={228} rot={120} scale={0.85} fill={LEAF.warm} />
        <OakLeaf x={134} y={246} rot={-110} scale={0.8} fill={LEAF.mid} />
      </g>
      <circle cx="148" cy="100" r="2" fill={LEAF.pale} opacity="0.85" />
      <circle cx="320" cy="86" r="1.8" fill="#F5D08A" opacity="0.95" />
      <circle cx="332" cy="156" r="1.6" fill={LEAF.pale} opacity="0.8" />
      <circle cx="120" cy="170" r="1.4" fill="#F5D08A" opacity="0.85" />
      <circle cx="170" cy="60" r="1.6" fill={LEAF.pale} opacity="0.7" />
      <circle cx="300" cy="220" r="1.4" fill="#F5D08A" opacity="0.7" />
      <circle cx="240" cy="60" r="1.4" fill={LEAF.pale} opacity="0.85" />
    </g>
  );
}

const BONUS_LEAVES: LeafSpec[] = [
  [144, 196, -70, 1.2, LEAF.warm],
  [160, 184, -55, 1.3, LEAF.mid],
  [178, 174, -40, 1.35, LEAF.dark],
  [196, 164, -25, 1.45, LEAF.warm],
  [214, 156, -15, 1.45, LEAF.mid],
  [314, 168, 70, 1.2, LEAF.warm],
  [296, 158, 55, 1.3, LEAF.mid],
  [278, 150, 40, 1.35, LEAF.dark],
  [262, 142, 25, 1.45, LEAF.warm],
  [246, 136, 15, 1.45, LEAF.mid],
  [182, 112, -30, 1.25, LEAF.dark],
  [196, 96, -15, 1.35, LEAF.warm],
  [210, 86, -5, 1.45, LEAF.mid],
  [282, 96, 30, 1.25, LEAF.dark],
  [268, 86, 15, 1.35, LEAF.warm],
  [254, 78, 5, 1.45, LEAF.mid],
  [232, 76, 0, 1.55, LEAF.dark],
  [220, 110, -15, 1.2, LEAF.warm],
  [244, 110, 15, 1.2, LEAF.mid],
  [232, 124, 0, 1.15, LEAF.warm],
  [206, 128, -25, 1, LEAF.mid],
  [256, 128, 25, 1, LEAF.warm],
  [228, 166, 0, 1.05, LEAF.warm],
  [210, 186, -20, 1, LEAF.mid],
  [248, 186, 20, 1, LEAF.warm],
  [186, 140, -35, 1, LEAF.mid],
  [272, 140, 35, 1, LEAF.warm],
];

const BONUS_PETAL_OFFSETS: Array<[string, number, number, number]> = [
  ["petal-1", 320, 200, 20],
  ["petal-2", 150, 240, -30],
  ["petal-3", 280, 260, 45],
  ["petal-4", 180, 200, -15],
];

function StageBonus() {
  return (
    <g>
      <defs>
        <radialGradient id="bonusHalo" cx="50%" cy="40%" r="55%">
          <stop offset="0%" stopColor="#F5D08A" stopOpacity="0.45" />
          <stop offset="40%" stopColor="#F5D08A" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#F5D08A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="230" cy="140" rx="180" ry="160" fill="url(#bonusHalo)" />
      <ellipse
        cx="230"
        cy="160"
        rx="130"
        ry="100"
        fill="#F5D08A"
        opacity="0.10"
      />

      <g className="kv-sway">
        <path
          d="M222 300 C 218 248, 232 200, 232 130"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="6.2"
          strokeLinecap="round"
        />
        <path
          d="M222 300 C 218 248, 232 200, 232 130"
          fill="none"
          stroke={LEAF.warm}
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path
          d="M220 270 C 222 264, 220 258, 222 252"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="0.7"
          opacity="0.6"
        />
        <path
          d="M226 234 C 224 228, 226 222, 224 216"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="0.7"
          opacity="0.6"
        />
        <path
          d="M230 200 C 228 194, 230 188, 228 182"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="0.7"
          opacity="0.6"
        />
        <path
          d="M210 300 C 216 290, 222 288, 224 292"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M240 300 C 234 290, 228 288, 226 292"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M225 226 C 198 214, 170 206, 144 196"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <path
          d="M232 200 C 260 188, 290 180, 314 168"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <path
          d="M229 168 C 212 150, 196 130, 182 112"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M232 154 C 250 134, 268 116, 282 96"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M232 142 C 232 126, 234 110, 232 94"
          fill="none"
          stroke={LEAF.dark}
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        {renderLeaves(BONUS_LEAVES)}
        <Acorn x={200} y={152} scale={1.1} />
        <Acorn x={248} y={144} scale={1.1} />
        <Acorn x={232} y={116} scale={1.2} />
        <Acorn x={270} y={166} scale={1.15} />
        <Acorn x={190} y={174} scale={1.1} />
        <Acorn x={218} y={138} />
        <Acorn x={258} y={120} scale={1.1} />
        <Acorn x={210} y={170} />
        <Acorn x={262} y={156} scale={1.05} />
        <g>
          <circle cx="216" cy="104" r="3.4" fill="#F5D08A" />
          <circle cx="216" cy="104" r="1.4" fill="#8A5A2E" />
        </g>
        <g>
          <circle cx="246" cy="98" r="3.4" fill="#F5D08A" />
          <circle cx="246" cy="98" r="1.4" fill="#8A5A2E" />
        </g>
        <g>
          <circle cx="228" cy="88" r="3.6" fill="#F8DA9A" />
          <circle cx="228" cy="88" r="1.5" fill="#8A5A2E" />
        </g>
        <g>
          <circle cx="264" cy="140" r="3.2" fill="#F5D08A" />
          <circle cx="264" cy="140" r="1.3" fill="#8A5A2E" />
        </g>
        <g>
          <circle cx="196" cy="126" r="3.2" fill="#F5D08A" />
          <circle cx="196" cy="126" r="1.3" fill="#8A5A2E" />
        </g>
        <g>
          <circle cx="236" cy="150" r="3" fill="#F8DA9A" />
          <circle cx="236" cy="150" r="1.2" fill="#8A5A2E" />
        </g>
        <g>
          <circle cx="210" cy="148" r="3" fill="#F5D08A" />
          <circle cx="210" cy="148" r="1.2" fill="#8A5A2E" />
        </g>
      </g>

      {BONUS_PETAL_OFFSETS.map(([cls, x, y, rot]) => (
        <g
          key={cls}
          className={`kv-petal-fall kv-${cls}`}
          style={{ transformOrigin: `${x}px ${y}px` }}
        >
          <ellipse
            cx={x}
            cy={y}
            rx="3"
            ry="2"
            fill="#F5D08A"
            transform={`rotate(${rot} ${x} ${y})`}
          />
        </g>
      ))}

      <OakLeaf x={332} y={228} rot={120} scale={0.85} fill={LEAF.warm} />
      <OakLeaf x={134} y={246} rot={-110} scale={0.8} fill={LEAF.mid} />

      <g className="kv-acorn-drop">
        <Acorn x={252} y={240} scale={1.1} />
      </g>

      <circle cx="148" cy="100" r="2.4" fill="#F5D08A" opacity="0.95" />
      <circle cx="320" cy="86" r="2.2" fill="#F8DA9A" opacity="0.95" />
      <circle cx="332" cy="156" r="2" fill={LEAF.pale} opacity="0.85" />
      <circle cx="120" cy="170" r="1.8" fill="#F5D08A" opacity="0.9" />
      <circle cx="170" cy="60" r="2" fill="#F8DA9A" opacity="0.85" />
      <circle cx="300" cy="220" r="1.8" fill="#F5D08A" opacity="0.85" />
      <circle cx="240" cy="60" r="1.8" fill={LEAF.pale} opacity="0.9" />
      <circle cx="100" cy="120" r="1.6" fill="#F5D08A" opacity="0.8" />
      <circle cx="358" cy="140" r="1.6" fill="#F8DA9A" opacity="0.85" />
      <circle cx="200" cy="40" r="1.4" fill="#F5D08A" opacity="0.75" />
      <circle cx="280" cy="40" r="1.4" fill={LEAF.pale} opacity="0.75" />
    </g>
  );
}

const STAGES = [
  Stage1,
  Stage2,
  Stage3,
  Stage4,
  Stage5,
  Stage6,
  Stage7,
  Stage8,
  Stage9,
  Stage10,
  Stage11,
  Stage12,
];

type Props = {
  stage?: Stage;
  /** When true, render the celebration state instead of the month-based stage. */
  bonusReady?: boolean;
};

export function Tree({ stage = 3, bonusReady = false }: Props) {
  const StageComponent = bonusReady
    ? StageBonus
    : STAGES[Math.max(0, Math.min(11, stage - 1))];
  return (
    <svg
      viewBox="0 0 460 460"
      style={{
        width: "100%",
        height: "auto",
        overflow: "visible",
        display: "block",
      }}
      aria-hidden="true"
    >
      <Ground />
      <StageComponent />
      <Pot />
    </svg>
  );
}
