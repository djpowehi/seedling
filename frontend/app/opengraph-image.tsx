import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Seedling — allowance that grows";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

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
          background:
            "linear-gradient(135deg, #ecfdf5 0%, #f5f5f4 50%, #fef3c7 100%)",
          padding: "80px",
        }}
      >
        <div style={{ fontSize: "180px", marginBottom: "24px" }}>🌱</div>
        <div
          style={{
            fontSize: "108px",
            fontWeight: 600,
            color: "#064e3b",
            letterSpacing: "-0.04em",
            lineHeight: 1,
          }}
        >
          seedling
        </div>
        <div
          style={{
            marginTop: "20px",
            fontSize: "48px",
            color: "#57534e",
            fontWeight: 400,
          }}
        >
          allowance that grows
        </div>
        <div
          style={{
            marginTop: "48px",
            fontSize: "26px",
            color: "#78716c",
            display: "flex",
            gap: "20px",
          }}
        >
          <span>built on Solana</span>
          <span style={{ color: "#a8a29e" }}>·</span>
          <span>powered by Kamino</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
