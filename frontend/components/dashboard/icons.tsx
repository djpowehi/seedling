// Hand-drawn-feel icons + goal illustrations for the dashboard.
// Source: Claude Design pass on Day 11.

type IconProps = { size?: number; color?: string };

export function Sprout({ size = 96, color = "#2E5C40" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M28 62 Q28 78 48 78 Q68 78 68 62 L66 60 L30 60 Z"
        stroke={color}
        strokeWidth="1.4"
        fill="#F1ECDC"
        strokeLinejoin="round"
      />
      <path
        d="M27 60 Q28 58 48 58 Q68 58 69 60"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M32 62 Q40 60.5 48 61 Q56 60.5 64 62"
        stroke={color}
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M48 58 Q47.5 48 48 32"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M48 38 Q34 36 30 24 Q40 22 47 32 Z"
        stroke={color}
        strokeWidth="1.4"
        fill={color}
        fillOpacity="0.18"
        strokeLinejoin="round"
      />
      <path
        d="M48 32 Q56 18 68 22 Q66 32 49 36 Z"
        stroke={color}
        strokeWidth="1.4"
        fill={color}
        fillOpacity="0.28"
        strokeLinejoin="round"
      />
      <path
        d="M36 28 Q42 30 47 33"
        stroke={color}
        strokeWidth="0.9"
        opacity="0.6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M58 25 Q53 29 49 33"
        stroke={color}
        strokeWidth="0.9"
        opacity="0.6"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M14 84 Q40 80 82 84"
        stroke={color}
        strokeWidth="0.8"
        opacity="0.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ArrowUR({ size = 12, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 9 L9 3"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M4 3 L9 3 L9 8"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowR({ size = 14, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 7 L12 7"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M8 3 L12 7 L8 11"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Simplified Pix mark — four diamond-shaped blades around a center point,
// in Banco Central do Brasil's official Pix teal (#32BCAD). Renders
// cleanly at icon size where the official multi-curve logo turns to mush.
// Used inside the "pay with Pix" / "withdraw to Pix" buttons in place of
// the lightning-bolt emoji we were using as a placeholder.
export function PixLogo({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="#32BCAD"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Pix"
    >
      {/* top blade */}
      <path d="M8 1.2 L10.8 4 L8 6.8 L5.2 4 Z" />
      {/* right blade */}
      <path d="M14.8 8 L12 10.8 L9.2 8 L12 5.2 Z" />
      {/* bottom blade */}
      <path d="M8 14.8 L5.2 12 L8 9.2 L10.8 12 Z" />
      {/* left blade */}
      <path d="M1.2 8 L4 5.2 L6.8 8 L4 10.8 Z" />
    </svg>
  );
}

export function Plus({ size = 12, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 1.5 L6 10.5 M1.5 6 L10.5 6"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Copy({ size = 11, color = "currentColor" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="3"
        width="7"
        height="8"
        rx="1"
        stroke={color}
        strokeWidth="1"
      />
      <path
        d="M2 8 L2 2 Q2 1.4 2.6 1.4 L8 1.4"
        stroke={color}
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export type GoalIlloKey =
  | "bike"
  | "switch"
  | "guitar"
  | "camera"
  | "book"
  | "pig"
  | "art"
  | "default";

export const GOAL_ILLOS: Record<
  GoalIlloKey,
  (color: string) => React.ReactNode
> = {
  bike: (color) => (
    <svg width="100%" height="100%" viewBox="0 0 80 56" fill="none">
      <circle
        cx="20"
        cy="38"
        r="11"
        stroke={color}
        strokeWidth="1.3"
        fill="none"
      />
      <circle
        cx="60"
        cy="38"
        r="11"
        stroke={color}
        strokeWidth="1.3"
        fill="none"
      />
      <circle cx="20" cy="38" r="2" fill={color} />
      <circle cx="60" cy="38" r="2" fill={color} />
      <path
        d="M20 38 L36 18 L52 38 L60 38"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M36 18 L46 18"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M52 38 L44 18"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M14 16 Q18 16 20 18"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  ),
  switch: (color) => (
    <svg width="100%" height="100%" viewBox="0 0 80 56" fill="none">
      <rect
        x="14"
        y="14"
        width="52"
        height="28"
        rx="4"
        stroke={color}
        strokeWidth="1.3"
        fill="none"
      />
      <path d="M30 14 L30 42" stroke={color} strokeWidth="1.3" />
      <path d="M50 14 L50 42" stroke={color} strokeWidth="1.3" />
      <circle cx="22" cy="22" r="1.6" fill={color} />
      <circle cx="22" cy="34" r="1.6" fill={color} />
      <circle cx="58" cy="22" r="1.6" fill={color} />
      <circle cx="58" cy="34" r="1.6" fill={color} />
      <rect
        x="36"
        y="22"
        width="8"
        height="12"
        rx="1"
        stroke={color}
        strokeWidth="1.1"
        fill="none"
      />
    </svg>
  ),
  guitar: (color) => (
    <svg width="100%" height="100%" viewBox="0 0 80 56" fill="none">
      <ellipse
        cx="50"
        cy="38"
        rx="14"
        ry="13"
        stroke={color}
        strokeWidth="1.3"
        fill="none"
      />
      <circle
        cx="50"
        cy="38"
        r="4"
        stroke={color}
        strokeWidth="1"
        fill="none"
      />
      <path
        d="M40 30 L20 12"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <rect
        x="14"
        y="6"
        width="10"
        height="6"
        rx="1"
        transform="rotate(-45 19 9)"
        stroke={color}
        strokeWidth="1.3"
        fill="none"
      />
      <path d="M36 33 L62 33" stroke={color} strokeWidth="0.7" opacity="0.5" />
      <path d="M36 38 L64 38" stroke={color} strokeWidth="0.7" opacity="0.5" />
      <path d="M36 43 L62 43" stroke={color} strokeWidth="0.7" opacity="0.5" />
    </svg>
  ),
  camera: (color) => (
    <svg width="100%" height="100%" viewBox="0 0 80 56" fill="none">
      <path
        d="M14 18 L26 18 L30 12 L50 12 L54 18 L66 18 Q68 18 68 20 L68 42 Q68 44 66 44 L14 44 Q12 44 12 42 L12 20 Q12 18 14 18 Z"
        stroke={color}
        strokeWidth="1.3"
        fill="none"
        strokeLinejoin="round"
      />
      <circle
        cx="40"
        cy="30"
        r="9"
        stroke={color}
        strokeWidth="1.3"
        fill="none"
      />
      <circle
        cx="40"
        cy="30"
        r="5"
        stroke={color}
        strokeWidth="1"
        fill="none"
      />
      <circle cx="60" cy="22" r="1.4" fill={color} />
    </svg>
  ),
  book: (color) => (
    <svg width="100%" height="100%" viewBox="0 0 80 56" fill="none">
      <path
        d="M14 12 Q26 14 40 16 L40 46 Q26 44 14 42 Z"
        stroke={color}
        strokeWidth="1.3"
        fill="none"
        strokeLinejoin="round"
      />
      <path
        d="M66 12 Q54 14 40 16 L40 46 Q54 44 66 42 Z"
        stroke={color}
        strokeWidth="1.3"
        fill="none"
        strokeLinejoin="round"
      />
      <path
        d="M19 22 Q26 23 35 24"
        stroke={color}
        strokeWidth="0.8"
        opacity="0.6"
      />
      <path
        d="M19 28 Q26 29 35 30"
        stroke={color}
        strokeWidth="0.8"
        opacity="0.6"
      />
      <path
        d="M45 24 Q54 23 61 22"
        stroke={color}
        strokeWidth="0.8"
        opacity="0.6"
      />
      <path
        d="M45 30 Q54 29 61 28"
        stroke={color}
        strokeWidth="0.8"
        opacity="0.6"
      />
    </svg>
  ),
  pig: (color) => (
    <svg width="100%" height="100%" viewBox="0 0 80 56" fill="none">
      <ellipse
        cx="42"
        cy="32"
        rx="22"
        ry="14"
        stroke={color}
        strokeWidth="1.3"
        fill="none"
      />
      <path
        d="M22 26 L20 18 L28 22"
        stroke={color}
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="none"
      />
      <circle
        cx="60"
        cy="30"
        r="4"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
      />
      <circle cx="60" cy="30" r="1" fill={color} />
      <circle cx="62" cy="30" r="1" fill={color} />
      <circle cx="34" cy="28" r="1.2" fill={color} />
      <path
        d="M30 46 L30 50 M40 46 L40 50 M50 46 L50 50"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M36 22 L40 16"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M22 20 L26 14"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  ),
  art: (color) => (
    <svg width="100%" height="100%" viewBox="0 0 80 56" fill="none">
      <path
        d="M40 8 Q60 8 64 24 Q66 36 56 36 L52 36 Q48 36 48 40 Q48 48 40 48 Q20 48 16 30 Q14 8 40 8 Z"
        stroke={color}
        strokeWidth="1.3"
        fill="none"
        strokeLinejoin="round"
      />
      <circle cx="26" cy="22" r="2.2" fill={color} fillOpacity="0.6" />
      <circle cx="36" cy="16" r="2.2" fill={color} fillOpacity="0.4" />
      <circle cx="50" cy="18" r="2.2" fill={color} fillOpacity="0.7" />
      <circle cx="56" cy="28" r="2.2" fill={color} fillOpacity="0.3" />
    </svg>
  ),
  default: (color) => (
    <svg width="100%" height="100%" viewBox="0 0 80 56" fill="none">
      <rect
        x="14"
        y="14"
        width="52"
        height="28"
        rx="2"
        stroke={color}
        strokeWidth="1.2"
        fill="none"
        strokeDasharray="3 3"
        opacity="0.5"
      />
      <path
        d="M40 22 L40 34 M34 28 L46 28"
        stroke={color}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  ),
};

export const GOAL_ILLO_KEYS: GoalIlloKey[] = [
  "pig",
  "bike",
  "switch",
  "guitar",
  "camera",
  "book",
  "art",
];
