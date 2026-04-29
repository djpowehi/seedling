import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Seedling — programmable allowance for families";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Palette mirrors the landing's stone+forest-green system. Edge runtime,
// no external font fetches — keep it system-stack so social previews
// generate fast and cache-friendly.
export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#FBF8F2",
          backgroundImage:
            "radial-gradient(circle at 25% 18%, rgba(58, 112, 80, 0.06) 0, transparent 45%), radial-gradient(circle at 78% 82%, rgba(90, 74, 54, 0.05) 0, transparent 50%)",
          padding: "72px",
          position: "relative",
        }}
      >
        {/* tiny eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: "20px",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#6F6A58",
            marginBottom: "32px",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "50%",
              background: "#3A7050",
              display: "inline-block",
            }}
          />
          programmable allowance · on Solana
        </div>

        {/* sprout emoji as a stand-in for the hand-drawn tree */}
        <div style={{ fontSize: "150px", marginBottom: "8px", lineHeight: 1 }}>
          🌱
        </div>

        {/* headline */}
        <div
          style={{
            fontSize: "128px",
            color: "#1F3A2A",
            letterSpacing: "-0.03em",
            lineHeight: 0.95,
            display: "flex",
            alignItems: "baseline",
            gap: "24px",
          }}
        >
          allowance that
          <span style={{ fontStyle: "italic", color: "#2E5C40" }}>grows</span>
        </div>

        {/* subline */}
        <div
          style={{
            marginTop: "26px",
            fontSize: "32px",
            color: "#4A4A3F",
            maxWidth: "880px",
            textAlign: "center",
            lineHeight: 1.3,
          }}
        >
          Money grows. Habits grow. Your kid grows with both.
        </div>

        {/* footer chips */}
        <div
          style={{
            marginTop: "56px",
            display: "flex",
            gap: "14px",
            fontSize: "22px",
            color: "#6F6A58",
            letterSpacing: "0.04em",
          }}
        >
          <span>USDC</span>
          <span style={{ color: "#B8AC91" }}>·</span>
          <span>Kamino yield</span>
          <span style={{ color: "#B8AC91" }}>·</span>
          <span>13th allowance</span>
        </div>

        {/* bottom-right wordmark */}
        <div
          style={{
            position: "absolute",
            bottom: "40px",
            right: "56px",
            fontSize: "26px",
            color: "#1F3A2A",
            letterSpacing: "-0.01em",
          }}
        >
          seedlingsol.xyz
        </div>
      </div>
    ),
    { ...size }
  );
}
