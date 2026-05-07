"use client";

// Privy login button — replaces wallet-adapter's WalletMultiButton.
// Two variants: `nav` for the small slot in the dashboard header,
// `gate` for the big CTA on the disconnected dashboard state.

import { useLogin, useLogout, usePrivy } from "@privy-io/react-auth";
import { useSeedlingWallet } from "@/lib/wallet";
import { useLocale } from "@/lib/i18n";

type Variant = "nav" | "gate";

function shortAddress(addr: string): string {
  return addr.length <= 8 ? addr : `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function PrivyLoginButton({ variant = "nav" }: { variant?: Variant }) {
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin();
  const { logout } = useLogout();
  const { publicKey } = useSeedlingWallet();
  const { t } = useLocale();

  const navStyle: React.CSSProperties = {
    height: 40,
    padding: "0 16px",
    borderRadius: 999,
    fontSize: 13,
    fontFamily: "var(--mono, monospace)",
    fontWeight: 500,
    letterSpacing: "0.02em",
  };

  const gateStyle: React.CSSProperties = {
    height: 56,
    padding: "0 32px",
    borderRadius: 999,
    fontSize: 15,
    fontWeight: 500,
  };

  const baseStyle = variant === "nav" ? navStyle : gateStyle;

  if (!ready) {
    return (
      <button
        className="dash-btn dash-btn-ghost"
        style={baseStyle}
        disabled
        aria-busy="true"
      >
        {t("auth.loading")}
      </button>
    );
  }

  if (!authenticated) {
    return (
      <button
        className="dash-btn dash-btn-primary"
        style={baseStyle}
        onClick={() => login()}
      >
        {variant === "gate" ? t("auth.gate.cta") : t("auth.signin")}
      </button>
    );
  }

  // Authenticated. Nav variant shows the address + a sign-out menu;
  // the gate variant shouldn't render at all once authenticated (the
  // dashboard moves past the gate), but render a sign-out fallback
  // just in case.
  return (
    <button
      className="dash-btn dash-btn-ghost"
      style={baseStyle}
      onClick={() => logout()}
      title={t("auth.signout")}
    >
      {publicKey ? shortAddress(publicKey.toBase58()) : t("auth.signout")}
    </button>
  );
}
