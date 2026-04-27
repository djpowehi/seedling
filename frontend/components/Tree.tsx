// Hand-drawn young oak — 5 growth stages.
// Source: Claude Design pass on Day 10. Same pot vocabulary and palette
// as the landing's hero seedling. Stage progression keeps the canopy
// on-axis so it reads as the same plant growing.

const POT_COLORS = {
  body: "#ECE4D2",
  shade: "#D9CFB8",
  rim: "#D9CFB8",
  edge: "#5A4A36",
  soil: "#4A3A28",
};
const LEAF = {
  dark: "#1F3A2A",
  mid: "#2E5C40",
  warm: "#3A7050",
  light: "#4A8A65",
  pale: "#9CB8A4",
  bud: "#4A8A65",
};

export function stageFor(totalUsd: number): 1 | 2 | 3 | 4 | 5 {
  if (totalUsd >= 10000) return 5;
  if (totalUsd >= 2000) return 4;
  if (totalUsd >= 500) return 3;
  if (totalUsd >= 100) return 2;
  return 1;
}

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
      <ellipse cx="230" cy="302" rx="62" ry="4.5" fill={POT_COLORS.soil} />
      <path
        d="M198 302 C 210 296, 250 296, 262 302 Z"
        fill={POT_COLORS.soil}
        opacity="0.85"
      />
      <circle cx="210" cy="301" r="1.2" fill={POT_COLORS.edge} opacity="0.55" />
      <circle cx="246" cy="303" r="1" fill={POT_COLORS.edge} opacity="0.5" />
      <circle cx="256" cy="301" r="0.9" fill={POT_COLORS.edge} opacity="0.5" />
      <circle cx="218" cy="303" r="0.9" fill={POT_COLORS.edge} opacity="0.4" />
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
    <g
      transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale} ${scale})`}
    >
      <path
        d="M0 0 C -2 -4, -6 -6, -8 -10 C -10 -14, -7 -16, -4 -14 C -3 -17, -8 -20, -6 -24 C -3 -26, -1 -22, 0 -20 C 1 -22, 3 -26, 6 -24 C 8 -20, 3 -17, 4 -14 C 7 -16, 10 -14, 8 -10 C 6 -6, 2 -4, 0 0 Z"
        fill={fill}
      />
      <path d="M0 0 V -22" stroke={vein} strokeWidth="0.5" opacity="0.55" />
    </g>
  );
}

function Acorn({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="2" rx="2.4" ry="3" fill="#8A5A2E" />
      <path d="M-2.6 0 A 2.6 1.6 0 0 1 2.6 0 Z" fill="#5A3A1E" />
      <circle cx="0" cy="-1" r="0.5" fill="#5A3A1E" />
    </g>
  );
}

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
      <circle cx="230" cy="252" r="1.4" fill={LEAF.dark} opacity="0.6" />
    </g>
  );
}

function Stage3() {
  return (
    <g className="kv-sway">
      <path
        d="M230 300 C 228 280, 234 260, 230 240 C 226 222, 232 208, 230 196"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M230 300 C 228 280, 234 260, 230 240 C 226 222, 232 208, 230 196"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M230 250 C 218 244, 208 238, 198 232"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M230 232 C 244 226, 254 222, 264 218"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <OakLeaf x={200} y={232} rot={-55} scale={1.2} fill={LEAF.mid} />
      <OakLeaf x={194} y={218} rot={-30} scale={1.15} fill={LEAF.warm} />
      <OakLeaf x={212} y={208} rot={-10} scale={1.1} fill={LEAF.mid} />
      <OakLeaf x={230} y={194} rot={0} scale={1.3} fill={LEAF.dark} />
      <OakLeaf x={222} y={200} rot={-15} scale={1.05} fill={LEAF.warm} />
      <OakLeaf x={238} y={200} rot={15} scale={1.05} fill={LEAF.mid} />
      <OakLeaf x={248} y={208} rot={20} scale={1.1} fill={LEAF.warm} />
      <OakLeaf x={262} y={220} rot={40} scale={1.15} fill={LEAF.mid} />
      <OakLeaf x={266} y={234} rot={60} scale={1.05} fill={LEAF.warm} />
      <OakLeaf x={218} y={260} rot={-70} scale={0.95} fill={LEAF.warm} />
      <OakLeaf x={244} y={252} rot={75} scale={0.95} fill={LEAF.mid} />
      <circle cx="278" cy="186" r="1.6" fill={LEAF.pale} opacity="0.7" />
      <circle cx="184" cy="200" r="1.2" fill={LEAF.pale} opacity="0.55" />
    </g>
  );
}

function Stage4() {
  return (
    <g className="kv-sway">
      <path
        d="M226 300 C 224 280, 228 256, 226 232 C 224 212, 232 196, 230 178"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M226 300 C 224 280, 228 256, 226 232 C 224 212, 232 196, 230 178"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M218 300 C 220 296, 224 294, 226 296"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M236 300 C 234 296, 230 294, 228 296"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M226 240 C 210 232, 192 224, 178 216"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M228 222 C 244 214, 264 208, 280 200"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M226 200 C 218 188, 212 178, 208 168"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M230 192 C 242 182, 250 172, 256 162"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M228 260 C 240 252, 246 244, 252 236"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <OakLeaf x={178} y={216} rot={-60} scale={1.2} fill={LEAF.warm} />
      <OakLeaf x={186} y={206} rot={-40} scale={1.25} fill={LEAF.mid} />
      <OakLeaf x={200} y={194} rot={-20} scale={1.3} fill={LEAF.dark} />
      <OakLeaf x={208} y={170} rot={-10} scale={1.2} fill={LEAF.warm} />
      <OakLeaf x={218} y={160} rot={0} scale={1.3} fill={LEAF.mid} />
      <OakLeaf x={232} y={150} rot={5} scale={1.4} fill={LEAF.dark} />
      <OakLeaf x={248} y={158} rot={20} scale={1.3} fill={LEAF.mid} />
      <OakLeaf x={258} y={170} rot={30} scale={1.2} fill={LEAF.warm} />
      <OakLeaf x={276} y={194} rot={40} scale={1.3} fill={LEAF.dark} />
      <OakLeaf x={284} y={206} rot={55} scale={1.2} fill={LEAF.mid} />
      <OakLeaf x={282} y={220} rot={70} scale={1.15} fill={LEAF.warm} />
      <OakLeaf x={222} y={186} rot={-15} scale={1.05} fill={LEAF.warm} />
      <OakLeaf x={240} y={184} rot={15} scale={1.05} fill={LEAF.warm} />
      <OakLeaf x={226} y={172} rot={-5} scale={1} fill={LEAF.mid} />
      <OakLeaf x={252} y={232} rot={75} scale={1} fill={LEAF.warm} />
      <OakLeaf x={208} y={232} rot={-75} scale={1} fill={LEAF.mid} />
      <circle cx="290" cy="152" r="1.6" fill={LEAF.pale} opacity="0.7" />
      <circle cx="170" cy="180" r="1.4" fill={LEAF.pale} opacity="0.55" />
      <circle cx="200" cy="140" r="1.2" fill={LEAF.pale} opacity="0.5" />
    </g>
  );
}

const STAGE5_LEAVES: Array<[number, number, number, number, string]> = [
  [148, 214, -70, 1.2, LEAF.warm],
  [160, 200, -55, 1.3, LEAF.mid],
  [176, 188, -40, 1.4, LEAF.dark],
  [194, 176, -25, 1.5, LEAF.warm],
  [212, 162, -15, 1.5, LEAF.mid],
  [188, 140, -30, 1.3, LEAF.dark],
  [200, 126, -10, 1.4, LEAF.warm],
  [218, 116, -5, 1.4, LEAF.mid],
  [232, 108, 0, 1.6, LEAF.dark],
  [246, 116, 8, 1.4, LEAF.warm],
  [260, 126, 18, 1.4, LEAF.mid],
  [276, 140, 28, 1.3, LEAF.dark],
  [292, 158, 40, 1.3, LEAF.warm],
  [300, 180, 55, 1.4, LEAF.mid],
  [294, 200, 65, 1.3, LEAF.warm],
  [276, 212, 55, 1.3, LEAF.dark],
  [250, 196, 30, 1.2, LEAF.mid],
  [224, 188, 0, 1.2, LEAF.warm],
  [210, 210, -30, 1.1, LEAF.warm],
  [244, 228, 45, 1.1, LEAF.mid],
  [180, 224, -60, 1.1, LEAF.warm],
  [170, 168, -30, 1.1, LEAF.mid],
  [222, 140, -10, 1.1, LEAF.warm],
  [256, 152, 20, 1.1, LEAF.mid],
];

function Stage5() {
  return (
    <g className="kv-sway">
      <path
        d="M222 300 C 218 274, 226 246, 222 218 C 220 194, 234 176, 232 156"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M222 300 C 218 274, 226 246, 222 218 C 220 194, 234 176, 232 156"
        fill="none"
        stroke={LEAF.warm}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M220 280 C 222 274, 220 268, 222 262"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="0.7"
        opacity="0.6"
      />
      <path
        d="M226 250 C 224 244, 226 238, 224 232"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="0.7"
        opacity="0.6"
      />
      <path
        d="M210 300 C 214 292, 220 290, 222 294"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M240 300 C 234 292, 226 290, 224 294"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M222 240 C 198 230, 174 224, 154 218"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M224 220 C 248 212, 274 208, 298 200"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M226 196 C 214 178, 200 160, 188 144"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M232 188 C 250 170, 264 154, 278 138"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M232 168 C 232 152, 234 138, 232 124"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M222 264 C 240 252, 254 240, 262 224"
        fill="none"
        stroke={LEAF.dark}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {STAGE5_LEAVES.map(([x, y, r, s, f], i) => (
        <OakLeaf key={i} x={x} y={y} rot={r} scale={s} fill={f} />
      ))}
      <Acorn x={208} y={166} />
      <Acorn x={252} y={158} />
      <Acorn x={232} y={124} />
      <Acorn x={276} y={186} />
      <Acorn x={190} y={200} />
      <g>
        <circle cx="218" cy="148" r="2.6" fill="#F5D08A" />
        <circle cx="218" cy="148" r="1" fill="#8A5A2E" />
      </g>
      <g>
        <circle cx="262" cy="172" r="2.4" fill="#F5D08A" />
        <circle cx="262" cy="172" r="0.9" fill="#8A5A2E" />
      </g>
      <OakLeaf x={320} y={240} rot={120} scale={0.8} fill={LEAF.warm} />
      <circle cx="320" cy="120" r="1.8" fill={LEAF.pale} opacity="0.7" />
      <circle cx="140" cy="150" r="1.4" fill={LEAF.pale} opacity="0.55" />
      <circle cx="328" cy="200" r="1.4" fill={LEAF.pale} opacity="0.5" />
    </g>
  );
}

const STAGES = [Stage1, Stage2, Stage3, Stage4, Stage5];

type Props = { stage?: 1 | 2 | 3 | 4 | 5 };

export function Tree({ stage = 3 }: Props) {
  const StageComponent = STAGES[Math.max(0, Math.min(4, stage - 1))];
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
