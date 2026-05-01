// Dashboard stylesheet — scoped to the .dash-root wrapper so it
// doesn't leak into the kid view or landing. Source: Claude Design
// pass on Day 11. Color tokens, typography, button system, card
// hover state, progress bar, rename inputs.

export const DASHBOARD_STYLES = `
  .dash-root {
    --stone:        #FBF8F2;
    --stone-2:      #F4EFE3;
    --stone-3:      #EAE3D2;
    --ink:          #1F1B14;
    --ink-2:        #4A4536;
    --ink-3:        #7A7461;
    --line:         #DCD3BD;
    --line-soft:    #E7DFC9;
    --forest:       #2E5C40;
    --forest-deep:  #1F4530;
    --forest-soft:  #DCE5DC;
    --rose:         #B0473A;
    --gold:         #B8893E;

    /* Distinct, slightly darker canvas vs the kid view (#FBF8F2). Reads
       as "the parent surface" the moment the page loads — Vicenzo's STBR
       feedback. Keeps the warm beige family. */
    background: var(--stone-2);
    color: var(--ink);
    font-family: var(--font-inter), system-ui, sans-serif;
    font-size: 15px;
    line-height: 1.55;
    font-weight: 400;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
    min-height: 100vh;
    background-image: radial-gradient(circle at 1px 1px, rgba(31,27,20,0.075) 1px, transparent 0);
    background-size: 22px 22px;
    width: 100%;
  }
  .dash-root *, .dash-root *::before, .dash-root *::after { box-sizing: border-box; }

  .dash-serif  { font-family: var(--font-instrument-serif), 'Times New Roman', serif; font-weight: 400; letter-spacing: -0.01em; }
  .dash-mono   { font-family: var(--font-jetbrains-mono), ui-monospace, monospace; }
  .dash-italic { font-style: italic; }

  .dash-eyebrow {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--ink-3);
    display: inline-flex; align-items: center; gap: 10px;
  }
  .dash-eyebrow .rule { width: 28px; height: 1px; background: var(--ink-3); display: inline-block; }

  .dash-pulse-dot { position: relative; width: 8px; height: 8px; display: inline-block; }
  .dash-pulse-dot::before, .dash-pulse-dot::after {
    content: ''; position: absolute; inset: 0; border-radius: 50%; background: var(--forest);
  }
  .dash-pulse-dot::after { animation: dash-pulse 2.4s ease-out infinite; opacity: 0.5; }
  @keyframes dash-pulse {
    0%   { transform: scale(1);   opacity: 0.5; }
    80%  { transform: scale(2.6); opacity: 0;   }
    100% { transform: scale(2.6); opacity: 0;   }
  }

  .dash-card {
    background: #FFFDF7;
    border: 1px solid var(--line-soft);
    border-radius: 4px;
    transition: transform 280ms cubic-bezier(.2,.7,.2,1),
                box-shadow 280ms cubic-bezier(.2,.7,.2,1),
                border-color 200ms;
  }
  .dash-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 30px -22px rgba(31,27,20,0.35);
    border-color: var(--line);
  }

  .dash-btn {
    font-family: var(--font-inter), sans-serif;
    font-size: 13px; font-weight: 500;
    border-radius: 2px;
    padding: 10px 14px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    transition: transform 180ms cubic-bezier(.2,.7,.2,1),
                background 180ms, color 180ms, border-color 180ms;
    display: inline-flex; align-items: center; gap: 8px;
    white-space: nowrap;
  }
  .dash-btn:hover:not(:disabled) { transform: scale(1.02); }
  .dash-btn:active:not(:disabled) { transform: scale(0.99); }
  .dash-btn:disabled { cursor: not-allowed; }
  .dash-btn-primary  { background: var(--forest); color: #F7F2E3; }
  .dash-btn-primary:hover:not(:disabled)  { background: var(--forest-deep); }
  .dash-btn-ghost    { border-color: var(--line); color: var(--ink); background: transparent; }
  .dash-btn-ghost:hover:not(:disabled)    { background: var(--stone-2); }
  .dash-btn-quiet    { color: var(--ink-2); padding: 10px 0; }
  .dash-btn-quiet:hover { color: var(--ink); }
  .dash-btn-disabled-state {
    background: transparent;
    color: var(--ink-3);
    border: 1px dashed var(--line);
    cursor: default;
  }

  .dash-btn-link {
    background: transparent;
    color: var(--ink-2);
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 3px;
    padding: 2px 0;
    cursor: pointer;
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 11px; letter-spacing: 0.04em;
    border: 0;
  }
  .dash-btn-link:hover { color: var(--forest); text-decoration-color: var(--forest); }
  .dash-btn-link-danger { color: var(--rose); }
  .dash-btn-link-danger:hover { color: #8a3328; text-decoration-color: #8a3328; }

  .dash-root input[type="text"],
  .dash-root input[type="number"],
  .dash-root input[type="url"] {
    font-family: var(--font-inter), sans-serif;
    font-size: 14px;
    background: #FFFDF7;
    border: 1px solid var(--line);
    border-radius: 2px;
    padding: 12px 14px;
    color: var(--ink);
    width: 100%;
    transition: border-color 160ms, background 160ms;
  }
  .dash-root input:focus {
    outline: none;
    border-color: var(--forest);
    background: #fff;
  }
  .dash-root input.dash-mono-input {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 13px;
  }
  .dash-root ::placeholder { color: var(--ink-3); opacity: 1; }

  .dash-field-label {
    font-family: var(--font-jetbrains-mono), monospace;
    font-size: 10px; letter-spacing: 0.16em;
    text-transform: uppercase; color: var(--ink-3);
    display: block; margin-bottom: 6px;
  }

  .dash-divider { height: 1px; background: var(--line-soft); border: 0; margin: 0; }
  .dash-wrap { max-width: 1280px; margin: 0 auto; padding: 0 40px; }

  .dash-nav {
    border-bottom: 1px solid var(--line-soft);
    background: rgba(251, 248, 242, 0.85);
    backdrop-filter: saturate(140%) blur(6px);
    position: sticky; top: 0; z-index: 30;
  }
  .dash-nav-inner {
    display: flex; align-items: center; justify-content: space-between;
    height: 72px;
  }
  .dash-wordmark {
    font-family: var(--font-instrument-serif), serif;
    font-size: 22px;
    color: var(--ink);
    display: inline-flex; align-items: baseline; gap: 5px;
    letter-spacing: -0.01em;
    text-decoration: none;
  }
  .dash-wordmark .dot {
    width: 5px; height: 5px;
    background: var(--forest);
    border-radius: 50%;
    display: inline-block;
    transform: translateY(-3px);
  }

  .dash-footer { margin-top: 120px; padding: 60px 0; border-top: 1px solid var(--line-soft); }
  .dash-footer-inner {
    display: flex; justify-content: space-between; align-items: center;
    gap: 24px; flex-wrap: wrap;
  }

  .dash-row { display: flex; }
  .dash-col { display: flex; flex-direction: column; }

  @media (max-width: 880px) {
    .dash-wrap { padding: 0 20px; }
    .dash-nav-inner { height: 64px; }
    .dash-root { font-size: 14px; }
  }

  .dash-progress {
    height: 6px; background: var(--stone-2);
    border-radius: 999px; overflow: hidden;
    border: 1px solid var(--line-soft);
  }
  .dash-progress > span {
    display: block; height: 100%;
    background: var(--forest);
    border-radius: 999px;
    transition: width 600ms cubic-bezier(.2,.7,.2,1);
  }

  .dash-rename-input {
    background: transparent; border: none; outline: none;
    font-family: var(--font-instrument-serif), serif;
    font-size: inherit; line-height: inherit; color: inherit;
    padding: 0; margin: 0; width: 100%;
    border-bottom: 1px dashed transparent;
  }
  .dash-rename-input:hover { border-bottom-color: var(--line); }
  .dash-rename-input:focus { border-bottom-color: var(--forest); }
  .dash-rename-target {
    cursor: text;
    border-bottom: 1px dashed transparent;
    transition: border-color 160ms;
  }
  .dash-rename-target:hover { border-bottom-color: var(--line); }

  .dash-addkid-grid {
    display: grid;
    grid-template-columns: 1fr 1.3fr 0.7fr;
    gap: 16px;
  }
  @media (max-width: 880px) {
    .dash-addkid-grid { grid-template-columns: 1fr; }
  }
`;
