"use client";

// Lightweight toast notification system. Used after distribute events
// to show "Sent $X to Maria 🎉" or "13th allowance arrived — $X.XX!"
// with a count-up animation on the dollar amount.
//
// Self-contained: provider + hook + portal. No external deps.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export type ToastVariant = "monthly" | "bonus" | "info";

export type ToastPayload = {
  variant?: ToastVariant;
  // Optional headline (e.g. "Sent $50 to Maria")
  title: string;
  // Optional value to count up to from 0 (USD). When set, renders below
  // the title in big serif. Used for the bonus moment.
  countUpUsd?: number;
  // Optional subtitle in mono.
  subtitle?: string;
  // ms before auto-dismiss. Defaults to 4500 (5500 for bonus).
  durationMs?: number;
};

type ActiveToast = ToastPayload & { id: number };

type Ctx = {
  showToast: (p: ToastPayload) => void;
};

const ToastContext = createContext<Ctx | null>(null);

export function useToast(): Ctx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const idRef = useRef(0);

  const showToast = useCallback((p: ToastPayload) => {
    idRef.current += 1;
    const id = idRef.current;
    const duration = p.durationMs ?? (p.variant === "bonus" ? 5500 : 4500);
    setToasts((prev) => [...prev, { ...p, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastViewport toasts={toasts} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ toasts }: { toasts: ActiveToast[] }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <div className="seedling-toast-viewport">
      <style dangerouslySetInnerHTML={{ __html: TOAST_STYLES }} />
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>,
    document.body
  );
}

function ToastCard({ toast }: { toast: ActiveToast }) {
  const variant = toast.variant ?? "info";
  return (
    <div
      className={`seedling-toast seedling-toast--${variant}`}
      role="status"
      aria-live="polite"
    >
      <div className="seedling-toast-eyebrow">
        <span className="seedling-toast-pulse"></span>
        {variant === "bonus"
          ? "13th allowance"
          : variant === "monthly"
          ? "monthly allowance"
          : "seedling"}
      </div>
      <div className="seedling-toast-title">{toast.title}</div>
      {toast.countUpUsd !== undefined && (
        <CountUpAmount target={toast.countUpUsd} />
      )}
      {toast.subtitle && (
        <div className="seedling-toast-subtitle">{toast.subtitle}</div>
      )}
    </div>
  );
}

function CountUpAmount({
  target,
  durationMs = 1400,
}: {
  target: number;
  durationMs?: number;
}) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (t: number) => {
      const elapsed = t - start;
      const p = Math.min(1, elapsed / durationMs);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayed(target * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return (
    <div className="seedling-toast-amount tabular-nums">
      $
      {displayed.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </div>
  );
}

const TOAST_STYLES = `
  .seedling-toast-viewport {
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 12px;
    pointer-events: none;
    max-width: calc(100vw - 48px);
  }
  .seedling-toast {
    pointer-events: auto;
    background: #FBF8F2;
    border: 1px solid #ECE4D2;
    border-radius: 14px;
    padding: 16px 18px;
    min-width: 280px;
    max-width: 360px;
    box-shadow: 0 12px 32px -16px rgba(36, 74, 51, 0.35),
                0 4px 12px -4px rgba(0, 0, 0, 0.08);
    display: flex;
    flex-direction: column;
    gap: 4px;
    animation: seedling-toast-in 320ms cubic-bezier(0.2, 0.7, 0.3, 1);
  }
  .seedling-toast--bonus {
    background: linear-gradient(135deg, #FBF8F2 0%, #FEF4D8 100%);
    border-color: #F5D08A;
    box-shadow: 0 16px 40px -16px rgba(201, 162, 74, 0.45),
                0 4px 16px -4px rgba(245, 208, 138, 0.4);
  }
  .seedling-toast--monthly {
    border-color: #DFE8DD;
  }
  @keyframes seedling-toast-in {
    from {
      transform: translateX(120%) scale(0.95);
      opacity: 0;
    }
    to {
      transform: translateX(0) scale(1);
      opacity: 1;
    }
  }
  .seedling-toast-eyebrow {
    font-family: var(--font-jetbrains-mono), ui-monospace, monospace;
    font-size: 10.5px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #6F6A58;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }
  .seedling-toast-pulse {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #3A7050;
    animation: seedling-toast-pulse 2s ease-out infinite;
  }
  .seedling-toast--bonus .seedling-toast-pulse {
    background: #C9A24A;
  }
  @keyframes seedling-toast-pulse {
    0%   { box-shadow: 0 0 0 0 currentColor; }
    70%  { box-shadow: 0 0 0 8px rgba(0,0,0,0); }
    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
  }
  .seedling-toast-title {
    font-family: var(--font-instrument-serif), Georgia, serif;
    font-size: 22px;
    line-height: 1.15;
    color: #1F3A2A;
    letter-spacing: -0.005em;
  }
  .seedling-toast-amount {
    font-family: var(--font-instrument-serif), Georgia, serif;
    font-size: 36px;
    line-height: 1;
    color: #2E5C40;
    font-variant-numeric: tabular-nums;
    margin-top: 6px;
  }
  .seedling-toast--bonus .seedling-toast-amount {
    color: #B8851A;
  }
  .seedling-toast-subtitle {
    font-family: var(--font-jetbrains-mono), ui-monospace, monospace;
    font-size: 11px;
    color: #6F6A58;
    margin-top: 6px;
    letter-spacing: 0.04em;
  }
`;
