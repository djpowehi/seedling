"use client";

import { ArrowR, Sprout } from "./icons";
import { useLocale } from "@/lib/i18n";

type Props = {
  onAdd: () => void;
};

export function EmptyState({ onAdd }: Props) {
  const { t } = useLocale();
  return (
    <div
      className="dash-card"
      style={{
        padding: "80px 40px 90px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 24,
        background: "#FFFDF7",
      }}
    >
      <Sprout size={140} />
      <div
        className="dash-col"
        style={{ gap: 12, alignItems: "center", maxWidth: 460 }}
      >
        <h2
          className="dash-serif dash-italic"
          style={{ fontSize: 56, lineHeight: 1, margin: 0 }}
        >
          {t("empty.title")}
        </h2>
        <p
          style={{
            color: "var(--ink-2)",
            margin: 0,
            fontSize: 16,
            lineHeight: 1.55,
          }}
        >
          {t("empty.body")}
        </p>
      </div>
      <button
        className="dash-btn dash-btn-primary"
        style={{ padding: "14px 22px", fontSize: 14 }}
        onClick={onAdd}
      >
        {t("empty.cta")} <ArrowR color="currentColor" />
      </button>
    </div>
  );
}
