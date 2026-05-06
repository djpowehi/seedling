"use client";

// Two-state language pill. EN ↔ PT. Mono font, ~48px wide, fits the
// dashboard nav at 375px alongside the wallet button. Active state is
// solid; inactive is ghost so the contrast tells the user where they
// already are.
//
// Lives in three places: landing nav, dashboard nav, kid-view header.
// Same component; the surrounding nav owns spacing.

import { useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

const STYLES = `
  .seed-locale-toggle {
    display: inline-flex; align-items: center;
    height: 28px;
    padding: 2px;
    border-radius: 99px;
    background: rgba(0, 0, 0, 0.04);
    border: 1px solid rgba(0, 0, 0, 0.08);
    font-family: var(--font-jetbrains-mono), ui-monospace, monospace;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    user-select: none;
  }
  .seed-locale-toggle button {
    appearance: none;
    border: 0;
    background: transparent;
    color: rgba(0, 0, 0, 0.5);
    padding: 4px 9px;
    height: 22px;
    line-height: 1;
    border-radius: 99px;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    letter-spacing: inherit;
    transition: background-color 140ms ease, color 140ms ease;
  }
  .seed-locale-toggle button:hover {
    color: rgba(0, 0, 0, 0.85);
  }
  .seed-locale-toggle button.is-active {
    background: #2E5C40;
    color: #FBF8F2;
    cursor: default;
  }
  .seed-locale-toggle button.is-active:hover {
    color: #FBF8F2;
  }
`;

export function LocaleToggle() {
  const { locale, setLocale, t } = useLocale();

  const click = (next: Locale) => {
    if (next !== locale) setLocale(next);
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div
        className="seed-locale-toggle"
        role="group"
        aria-label={t("locale.toggle.aria")}
      >
        <button
          type="button"
          className={locale === "en" ? "is-active" : ""}
          onClick={() => click("en")}
          aria-pressed={locale === "en"}
        >
          EN
        </button>
        <button
          type="button"
          className={locale === "pt-BR" ? "is-active" : ""}
          onClick={() => click("pt-BR")}
          aria-pressed={locale === "pt-BR"}
        >
          PT
        </button>
      </div>
    </>
  );
}
