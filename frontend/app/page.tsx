import Link from "next/link";

// Landing page — sourced from a Claude Design pass on Day 10 evening.
// All styles are scoped to landing-* class names + the `landing-root`
// wrapper so they don't leak into the dashboard. Fonts (Instrument
// Serif, Inter, JetBrains Mono) are loaded via next/font in layout.tsx
// as CSS variables — referenced here by their original names so the
// designer's CSS works unchanged.

const STYLES = `
  .landing-root {
    --stone-50:  #FBF8F2;
    --stone-100: #F5F0E6;
    --stone-200: #ECE4D2;
    --stone-300: #D9CFB8;
    --stone-400: #B8AC91;
    --stone-500: #8A8169;
    --ink:       #2A2A22;
    --ink-soft:  #4A4A3F;
    --ink-muted: #6F6A58;
    --green-900: #1F3A2A;
    --green-800: #244A33;
    --green-700: #2E5C40;
    --green-600: #3A7050;
    --green-500: #4A8A65;
    --green-300: #9CB8A4;
    --green-100: #DFE8DD;
    --bark:      #5A4A36;
    --serif: var(--font-instrument-serif), 'Iowan Old Style', Georgia, serif;
    --sans:  var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif;
    --mono:  var(--font-jetbrains-mono), ui-monospace, monospace;
    --max: 1180px;
    background: var(--stone-50);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 17px;
    line-height: 1.55;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .landing-root *, .landing-root *::before, .landing-root *::after {
    box-sizing: border-box;
  }
  .landing-root ::selection { background: var(--green-700); color: var(--stone-50); }

  .landing-nav {
    max-width: var(--max);
    margin: 0 auto;
    padding: 28px 32px 0;
    display: flex; align-items: center; justify-content: space-between;
  }
  .landing-wordmark {
    font-family: var(--serif);
    font-size: 26px;
    letter-spacing: -0.01em;
    color: var(--green-800);
    text-decoration: none;
    display: inline-flex; align-items: center; gap: 10px;
  }
  .landing-wordmark .dot {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--green-700);
    display: inline-block;
    transform: translateY(-6px);
  }
  .landing-nav-meta {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.04em;
    color: var(--ink-muted);
    text-transform: uppercase;
    display: flex; align-items: center; gap: 10px;
  }
  .landing-pulse {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--green-600);
    box-shadow: 0 0 0 0 rgba(58, 112, 80, 0.5);
    animation: landing-pulse 2.4s ease-out infinite;
  }
  @keyframes landing-pulse {
    0%   { box-shadow: 0 0 0 0 rgba(58, 112, 80, 0.45); }
    70%  { box-shadow: 0 0 0 8px rgba(58, 112, 80, 0); }
    100% { box-shadow: 0 0 0 0 rgba(58, 112, 80, 0); }
  }

  .landing-hero {
    max-width: var(--max);
    margin: 0 auto;
    padding: 72px 32px 96px;
    display: grid;
    grid-template-columns: 1.05fr 0.95fr;
    gap: 48px;
    align-items: center;
    min-height: 78vh;
  }
  .landing-eyebrow {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--green-700);
    margin-bottom: 28px;
    display: inline-flex; align-items: center; gap: 10px;
  }
  .landing-eyebrow::before {
    content: ''; width: 24px; height: 1px;
    background: var(--green-700);
    display: inline-block;
  }
  .landing-headline {
    font-family: var(--serif);
    font-weight: 400;
    font-size: clamp(56px, 7.2vw, 104px);
    line-height: 0.96;
    letter-spacing: -0.02em;
    color: var(--green-900);
    margin: 0 0 32px;
    text-wrap: balance;
  }
  .landing-headline em {
    font-style: italic;
    color: var(--green-700);
  }
  .landing-subhead {
    font-size: 19px;
    line-height: 1.5;
    color: var(--ink-soft);
    max-width: 460px;
    margin: 0 0 40px;
    text-wrap: pretty;
  }
  .landing-cta-row {
    display: flex; flex-direction: column;
    align-items: flex-start; gap: 14px;
  }
  .landing-cta {
    display: inline-flex; align-items: center; gap: 12px;
    background: var(--green-800);
    color: var(--stone-50);
    font-family: var(--sans);
    font-size: 16px;
    font-weight: 500;
    letter-spacing: -0.005em;
    padding: 18px 28px;
    border-radius: 10px;
    text-decoration: none;
    border: 1px solid var(--green-900);
    transition: transform 200ms ease, background 200ms ease, box-shadow 200ms ease;
    box-shadow: 0 1px 0 rgba(0,0,0,0.05);
  }
  .landing-cta:hover {
    background: var(--green-900);
    transform: translateY(-1px);
    box-shadow: 0 8px 24px -12px rgba(36, 74, 51, 0.5);
  }
  .landing-cta .arrow { transition: transform 220ms cubic-bezier(0.5, 0, 0.2, 1); }
  .landing-cta:hover .arrow { transform: translateX(4px); }
  .landing-cta-note {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink-muted);
    letter-spacing: 0.02em;
    padding-left: 4px;
  }

  .landing-illo-wrap {
    position: relative;
    display: flex; justify-content: center; align-items: flex-end;
    height: 100%; min-height: 520px;
  }
  .landing-illo {
    width: 100%; max-width: 460px; height: auto; overflow: visible;
  }
  .landing-illo .ground { stroke: var(--stone-300); stroke-width: 1.2; fill: none; }
  .landing-illo .pot { fill: var(--stone-200); stroke: var(--bark); stroke-width: 1.6; stroke-linejoin: round; }
  .landing-illo .pot-rim { fill: var(--stone-300); stroke: var(--bark); stroke-width: 1.6; }
  .landing-illo .pot-shade { fill: var(--stone-300); opacity: 0.6; }
  .landing-illo .soil { fill: #4A3A28; }
  .landing-illo .soil-detail { fill: #6B5840; }
  .landing-illo .leaf { fill: var(--green-700); }

  .landing-sway {
    transform-origin: 230px 372px;
    animation: landing-sway 7s ease-in-out infinite;
  }
  @keyframes landing-sway {
    0%, 100% { transform: rotate(-2deg); }
    50%      { transform: rotate(2.4deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .landing-sway, .landing-pulse, .landing-speck { animation: none; }
  }
  .landing-speck {
    fill: var(--green-600);
    opacity: 0;
    animation: landing-drift 9s ease-in-out infinite;
  }
  .landing-speck.s2 { animation-delay: 4.5s; }
  @keyframes landing-drift {
    0%   { transform: translate(0, 0); opacity: 0; }
    20%  { opacity: 0.6; }
    80%  { opacity: 0.3; }
    100% { transform: translate(40px, -120px); opacity: 0; }
  }

  .landing-section {
    max-width: var(--max);
    margin: 0 auto;
    padding: 96px 32px;
    border-top: 1px solid var(--stone-200);
  }
  .landing-section-label {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-muted);
    margin-bottom: 48px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .landing-section-label .num { color: var(--green-700); }

  .landing-steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--stone-200);
    border: 1px solid var(--stone-200);
    border-radius: 4px;
    overflow: hidden;
  }
  .landing-step {
    background: var(--stone-50);
    padding: 44px 36px 48px;
    display: flex; flex-direction: column; gap: 28px;
    min-height: 280px;
  }
  .landing-step-num {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-muted);
    letter-spacing: 0.14em;
  }
  .landing-step-icon { width: 56px; height: 56px; color: var(--green-700); }
  .landing-step h3 {
    font-family: var(--serif);
    font-weight: 400;
    font-size: 28px;
    line-height: 1.15;
    letter-spacing: -0.01em;
    color: var(--green-900);
    margin-top: auto;
    text-wrap: balance;
  }
  .landing-step p {
    font-size: 15px;
    color: var(--ink-muted);
    line-height: 1.5;
    max-width: 280px;
  }

  .landing-shots-section .landing-section-label { margin-bottom: 56px; }
  .landing-shots {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
  }
  .landing-shots--two { grid-template-columns: repeat(2, 1fr); }
  .landing-shot {
    aspect-ratio: 9 / 14;
    background: var(--stone-100);
    border: 1px solid var(--stone-200);
    border-radius: 14px;
    position: relative; overflow: hidden;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 18px;
    margin: 0;
  }
  .landing-shot::before {
    content: '';
    position: absolute; inset: 0;
    background-image: repeating-linear-gradient(
      135deg,
      transparent 0,
      transparent 14px,
      rgba(138, 129, 105, 0.06) 14px,
      rgba(138, 129, 105, 0.06) 15px
    );
    pointer-events: none;
  }
  /* Real-screenshot variant: landscape aspect, image fills the card,
     hatching is suppressed, caption sits below the image as a chrome
     band rather than overlapping it. */
  .landing-shot--filled {
    aspect-ratio: auto;
    padding: 0;
    background: var(--stone-50);
    box-shadow: 0 18px 40px -28px rgba(31, 58, 42, 0.32);
    transition: transform 240ms cubic-bezier(0.2, 0.7, 0.2, 1),
                box-shadow 240ms cubic-bezier(0.2, 0.7, 0.2, 1);
  }
  .landing-shot--filled:hover {
    transform: translateY(-2px);
    box-shadow: 0 22px 48px -28px rgba(31, 58, 42, 0.4);
  }
  .landing-shot--filled::before { display: none; }
  /* Tag-above-the-photo wrapper: badge sits in its own row, the figure
     fills the rest. The earlier absolute positioning is overridden so
     the tag flows naturally above the image. */
  .landing-shot-wrap {
    display: flex; flex-direction: column;
    gap: 14px;
  }
  .landing-shot-wrap .landing-shot-tag {
    align-self: flex-start;
    position: static;
  }
  .landing-shot-img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 1520 / 1080;
    object-fit: cover;
    object-position: top center;
  }
  .landing-shot-caption {
    padding: 16px 20px 18px;
    font-family: var(--serif);
    font-size: 22px;
    line-height: 1.15;
    color: var(--ink-soft);
    border-top: 1px solid var(--stone-200);
    background: var(--stone-50);
  }
  .landing-shot-caption span {
    display: block;
    margin-top: 4px;
    font-family: var(--mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-muted);
  }
  .landing-shot-tag {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.14em;
    color: var(--ink-muted);
    text-transform: uppercase;
    background: var(--stone-50);
    border: 1px solid var(--stone-200);
    padding: 6px 10px;
    border-radius: 4px;
    align-self: flex-start;
    position: relative; z-index: 1;
  }
  .landing-shot-name {
    font-family: var(--serif);
    font-size: 22px;
    line-height: 1.15;
    color: var(--ink-soft);
    position: relative; z-index: 1;
    max-width: 80%;
  }
  .landing-shot-name span {
    display: block;
    font-family: var(--mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--ink-muted);
    margin-top: 6px;
  }

  .landing-footer {
    max-width: var(--max);
    margin: 0 auto;
    padding: 72px 32px 56px;
    border-top: 1px solid var(--stone-200);
    display: flex; justify-content: space-between; align-items: flex-end;
    flex-wrap: wrap; gap: 32px;
  }
  .landing-foot-mark {
    font-family: var(--serif);
    font-size: 96px;
    line-height: 0.85;
    color: var(--green-800);
    letter-spacing: -0.03em;
  }
  .landing-foot-meta {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--ink-muted);
    text-align: right;
    letter-spacing: 0.02em;
    line-height: 1.9;
  }
  .landing-foot-meta a {
    color: var(--ink-soft);
    text-decoration: none;
    border-bottom: 1px solid var(--stone-300);
    padding-bottom: 1px;
    transition: color 160ms ease, border-color 160ms ease;
  }
  .landing-foot-meta a:hover {
    color: var(--green-700);
    border-color: var(--green-700);
  }
  .landing-foot-built {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    margin-bottom: 6px;
  }

  @media (max-width: 880px) {
    .landing-hero {
      grid-template-columns: 1fr;
      gap: 24px;
      padding: 48px 24px 64px;
      min-height: auto;
    }
    .landing-illo-wrap { min-height: 380px; order: -1; }
    .landing-illo { max-width: 320px; }
    .landing-steps { grid-template-columns: 1fr; }
    .landing-shots { grid-template-columns: 1fr; }
    .landing-shot { aspect-ratio: 16 / 11; }
    .landing-shot--filled { aspect-ratio: auto; }
    .landing-foot-mark { font-size: 64px; }
    .landing-section { padding: 64px 24px; }
  }
`;

export default function Home() {
  return (
    <div className="landing-root">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />

      <nav className="landing-nav">
        <Link href="/" className="landing-wordmark">
          seedling<span className="dot"></span>
        </Link>
        <div className="landing-nav-meta">
          <span className="landing-pulse"></span>
          <span>live on Solana</span>
        </div>
      </nav>

      <header className="landing-hero">
        <div>
          <div className="landing-eyebrow">
            Programmable allowance for families · on Solana
          </div>
          <h1 className="landing-headline">
            allowance
            <br />
            that <em>grows</em>.
          </h1>
          <p className="landing-subhead">
            Money grows. Habits grow. Your kid grows with both. Parents deposit
            USDC, the vault earns yield through Kamino, and we only earn when
            families do.
          </p>
          <div className="landing-cta-row">
            <Link href="/dashboard" className="landing-cta">
              Open the dashboard
              <svg
                className="arrow"
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
              >
                <path
                  d="M3 8h10M9 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <span className="landing-cta-note">
              Live on Solana · no wallet required to look around
            </span>
          </div>
        </div>

        <div className="landing-illo-wrap">
          <svg
            className="landing-illo"
            viewBox="0 0 460 560"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path className="ground" d="M40 470 Q230 458 420 470" />
            <path
              className="ground"
              d="M70 480 Q230 472 390 480"
              opacity="0.5"
            />
            <circle className="landing-speck" cx="320" cy="320" r="2" />
            <circle className="landing-speck s2" cx="160" cy="280" r="1.6" />

            <g className="landing-sway">
              <path
                d="M230 372 C 228 340, 234 312, 230 282 C 226 256, 232 232, 230 214"
                fill="none"
                stroke="#3A7050"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
              <path
                className="leaf"
                d="M230 220 C 210 214, 188 210, 174 196 C 176 184, 196 178, 214 188 C 224 196, 230 208, 230 220 Z"
                fill="#2E5C40"
              />
              <path
                d="M230 220 C 218 212, 204 204, 188 196"
                fill="none"
                stroke="#1F3A2A"
                strokeWidth="0.9"
                strokeLinecap="round"
                opacity="0.55"
              />
              <path
                d="M198 192 C 206 196, 214 202, 220 210"
                fill="none"
                stroke="#9CB8A4"
                strokeWidth="0.8"
                strokeLinecap="round"
                opacity="0.7"
              />
              <path
                className="leaf"
                d="M230 220 C 250 212, 274 208, 290 192 C 286 180, 264 176, 246 188 C 236 196, 230 208, 230 220 Z"
                fill="#3A7050"
              />
              <path
                d="M230 220 C 244 210, 260 202, 278 192"
                fill="none"
                stroke="#1F3A2A"
                strokeWidth="0.9"
                strokeLinecap="round"
                opacity="0.55"
              />
              <path
                d="M268 188 C 260 194, 252 200, 246 208"
                fill="none"
                stroke="#9CB8A4"
                strokeWidth="0.8"
                strokeLinecap="round"
                opacity="0.7"
              />
              <path
                d="M230 214 C 226 206, 226 198, 230 194 C 234 198, 234 206, 230 214 Z"
                fill="#4A8A65"
              />
              <path
                d="M230 196 V 212"
                fill="none"
                stroke="#1F3A2A"
                strokeWidth="0.7"
                opacity="0.5"
              />
              <circle cx="230" cy="220" r="1.6" fill="#1F3A2A" opacity="0.6" />
            </g>

            <g>
              <path
                className="pot"
                d="M170 372 L 290 372 L 282 432 C 280 444, 264 448, 230 448 C 196 448, 180 444, 178 432 Z"
              />
              <path
                className="pot-shade"
                d="M178 432 C 180 444, 196 448, 230 448 C 264 448, 280 444, 282 432 L 280 420 C 276 428, 260 432, 230 432 C 200 432, 184 428, 180 420 Z"
              />
              <path
                className="pot-rim"
                d="M162 370 L 298 370 L 292 384 L 168 384 Z"
              />
              <ellipse className="soil" cx="230" cy="374" rx="62" ry="5" />
              <path
                className="soil"
                d="M198 374 C 210 368, 250 368, 262 374 Z"
              />
              <circle className="soil-detail" cx="210" cy="373" r="1.4" />
              <circle className="soil-detail" cx="246" cy="375" r="1.2" />
              <circle className="soil-detail" cx="256" cy="373" r="1" />
              <circle className="soil-detail" cx="218" cy="375" r="1" />
            </g>
          </svg>
        </div>
      </header>

      <section className="landing-section">
        <div className="landing-section-label">
          <span>
            <span className="num">02</span> &nbsp;&nbsp;How it works
          </span>
          <span>Three steps · one decision</span>
        </div>

        <div className="landing-steps">
          <div className="landing-step">
            <span className="landing-step-num">i.</span>
            <svg
              className="landing-step-icon"
              viewBox="0 0 56 56"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="8" y="16" width="40" height="28" rx="3" />
              <path d="M8 22h40" />
              <circle
                cx="40"
                cy="34"
                r="2.4"
                fill="currentColor"
                stroke="none"
              />
              <path d="M14 12h28" opacity="0.5" />
            </svg>
            <h3>Parents deposit USDC, once.</h3>
            <p>
              One transaction sets the principal. No subscriptions, no monthly
              chores.
            </p>
          </div>

          <div className="landing-step">
            <span className="landing-step-num">ii.</span>
            <svg
              className="landing-step-icon"
              viewBox="0 0 56 56"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M28 46 C 28 32, 18 26, 12 22 C 14 32, 18 42, 28 46 Z" />
              <path d="M28 46 C 28 30, 38 24, 46 20 C 44 32, 40 42, 28 46 Z" />
              <path d="M28 46 V 30" opacity="0.6" />
            </svg>
            <h3>Kamino lends it at ~8% APY.</h3>
            <p>
              The vault deposits into Kamino lending. Yield compounds in the
              background.
            </p>
          </div>

          <div className="landing-step">
            <span className="landing-step-num">iii.</span>
            <svg
              className="landing-step-icon"
              viewBox="0 0 56 56"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="10" y="14" width="36" height="32" rx="3" />
              <path d="M10 22h36" />
              <path d="M18 10v8M38 10v8" />
              <circle cx="28" cy="34" r="6" />
              <path d="M28 31v6M25 34h6" opacity="0.6" />
            </svg>
            <h3>Kids get paid monthly. Bonus at year-end.</h3>
            <p>
              The 1st of every month, the allowance arrives. Year-end brings the
              annual bonus — pure yield.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-section landing-shots-section">
        <div className="landing-section-label">
          <span>
            <span className="num">03</span> &nbsp;&nbsp;The product
          </span>
          <span>Two views · same family</span>
        </div>

        <div className="landing-shots landing-shots--two">
          <div className="landing-shot-wrap">
            <span className="landing-shot-tag">screen 01 · parent</span>
            <figure className="landing-shot landing-shot--filled">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/parent-dashboard.png"
                alt="Seedling parent dashboard with two kids saving"
                className="landing-shot-img"
              />
              <figcaption className="landing-shot-caption">
                Parent dashboard
                <span>deposit · withdraw · monthly · bonus</span>
              </figcaption>
            </figure>
          </div>
          <div className="landing-shot-wrap">
            <span className="landing-shot-tag">screen 02 · kid</span>
            <figure className="landing-shot landing-shot--filled">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/kid-view.png"
                alt="Seedling kid view with a growing tree and live yield ticker"
                className="landing-shot-img"
              />
              <figcaption className="landing-shot-caption">
                Kid view
                <span>a tree, growing — no wallet needed</span>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-foot-mark">seedling.</div>
        <div className="landing-foot-meta">
          <div className="landing-foot-built">Built on Kamino · Solana</div>
          <div>
            <a
              href="https://github.com/djpowehi/seedling"
              target="_blank"
              rel="noreferrer"
            >
              github
            </a>
            &nbsp;·&nbsp;
            <a
              href="https://twitter.com/seedling_sol"
              target="_blank"
              rel="noreferrer"
            >
              @seedling_sol
            </a>
          </div>
          <div style={{ opacity: 0.55, marginTop: 8 }}>
            © 2026 · seedlingsol.xyz
          </div>
        </div>
      </footer>
    </div>
  );
}
