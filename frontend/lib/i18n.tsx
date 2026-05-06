"use client";

// Lightweight i18n: React Context + flat-keyed dictionary. Two locales:
// "en" (default) and "pt-BR" (the audience-fit for the Pix integration).
//
// Why custom instead of next-intl: we have ~150 strings, two languages,
// and want zero routing changes. A 60-line context + dictionary is
// faster to ship than configuring an i18n library.
//
// Locale persists in localStorage["seedling.locale"]. First-load default
// is "pt-BR" if the browser language starts with "pt", else "en". The
// LocaleToggle component lets the user override either way.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import { en } from "@/lib/translations/en";
import { ptBR } from "@/lib/translations/pt-BR";

export type Locale = "en" | "pt-BR";

// Single source of truth for keys: derived from the English dictionary.
// pt-BR must satisfy the same shape (TS enforces this in pt-BR.ts).
export type TranslationKey = keyof typeof en;

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = {
  en,
  "pt-BR": ptBR,
};

const STORAGE_KEY = "seedling.locale";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "pt-BR") return saved;
  } catch {
    // localStorage blocked (private mode, etc.) — fall through to nav.
  }
  const nav = window.navigator?.language ?? "";
  return nav.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Default to "en" during SSR; sync with the real preference after mount
  // to avoid a hydration mismatch. The first paint is "en" briefly, then
  // hydration switches to the user's actual locale — fine in practice
  // because locale-sensitive copy below the fold has time to settle.
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const detected = detectInitialLocale();
    if (detected !== locale) setLocaleState(detected);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot mount sync
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore — locale still applies in-memory for this session
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const dict = DICTIONARIES[locale];
      // Fall back to en on missing keys so partial translations don't
      // break the page mid-render. Useful while we backfill pt-BR.
      const raw = dict[key] ?? DICTIONARIES.en[key] ?? String(key);
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_, name: string) =>
        Object.prototype.hasOwnProperty.call(vars, name)
          ? String(vars[name])
          : `{${name}}`
      );
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be called inside a <LocaleProvider>");
  }
  return ctx;
}

/**
 * Render a templated string with a single `{italic}` placeholder, swapping
 * the placeholder for an `<em>`-wrapped translation. Used for hero
 * headlines + dashboard titles where one word is italicized.
 */
export function TItalic({
  tplKey,
  italicKey,
  vars,
}: {
  tplKey: TranslationKey;
  italicKey: TranslationKey;
  vars?: Record<string, string | number>;
}) {
  const { t } = useLocale();
  const tmpl = t(tplKey, vars);
  const [pre, post = ""] = tmpl.split("{italic}");
  return (
    <>
      {pre}
      <em>{t(italicKey)}</em>
      {post}
    </>
  );
}
