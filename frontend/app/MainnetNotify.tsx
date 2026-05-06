"use client";

// Mainnet-launch DM CTA on the landing page. Captures interest via X DM
// rather than email — zero infrastructure, zero spam. Trade-off vs email:
// no distribution list, each ping is a 1:1 conversation.
//
// Uses X's direct-DM compose URL with the numeric recipient_id so the
// visitor lands directly in a compose window. The screen_name fallback
// also works on mobile clients that don't honor recipient_id.

import { useLocale } from "@/lib/i18n";

const X_HANDLE = "seedling_sol";
const X_USER_ID = "2043459270847377408";
const X_DM_URL = `https://twitter.com/messages/compose?recipient_id=${X_USER_ID}`;

export function MainnetNotify() {
  const { t } = useLocale();
  return (
    <a
      className="landing-notify-card landing-notify-card--dm"
      href={X_DM_URL}
      target="_blank"
      rel="noreferrer"
    >
      <div className="landing-notify-headline">{t("mainnet.headline")}</div>
      <p className="landing-notify-sub">{t("mainnet.body")}</p>
      <div className="landing-notify-cta">
        <span>{t("mainnet.cta", { handle: X_HANDLE })}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 8h10M9 4l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <p className="landing-notify-fine">{t("mainnet.fine")}</p>
    </a>
  );
}
