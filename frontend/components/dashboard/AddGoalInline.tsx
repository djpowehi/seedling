"use client";

import { useEffect, useRef, useState } from "react";
import { addSavingsGoal } from "@/lib/savingsGoals";
import { fileToCompressedDataUrl } from "@/lib/imageUpload";
import { useLocale } from "@/lib/i18n";
import { GOAL_ILLOS, GOAL_ILLO_KEYS, type GoalIlloKey } from "./icons";

type Props = {
  familyPubkey: string;
  onSaved: () => void;
  onCancel: () => void;
};

export function AddGoalInline({ familyPubkey, onSaved, onCancel }: Props) {
  const { t } = useLocale();
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState("150");
  const [illo, setIllo] = useState<GoalIlloKey>("pig");
  const [photoUrl, setPhotoUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    const result = await fileToCompressedDataUrl(file);
    setUploading(false);
    if (!result.ok) {
      setUploadError(result.error);
      return;
    }
    setPhotoUrl(result.dataUrl);
  };

  const save = () => {
    const amount = parseFloat(target);
    if (!label.trim() || !Number.isFinite(amount) || amount <= 0) return;
    addSavingsGoal(familyPubkey, {
      label,
      amountUsd: amount,
      photoUrl: photoUrl || undefined,
      illo,
    });
    onSaved();
  };

  return (
    <div
      className="dash-col"
      style={{
        borderTop: "1px solid var(--line-soft)",
        padding: "14px 0",
        gap: 10,
      }}
    >
      <div
        className="dash-row"
        style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}
      >
        <input
          ref={labelRef}
          type="text"
          placeholder={t("goal.add.name_placeholder")}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          style={{ flex: "1 1 200px" }}
        />
        <div className="dash-row" style={{ gap: 6, alignItems: "center" }}>
          <input
            type="number"
            min={1}
            max={5000}
            placeholder="$"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="dash-mono-input"
            style={{ width: 90 }}
          />
          <span
            className="dash-mono"
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              letterSpacing: "0.04em",
            }}
          >
            USDC
          </span>
        </div>
      </div>
      <div
        className="dash-row"
        style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}
      >
        <span
          className="dash-field-label"
          style={{ marginBottom: 0, marginRight: 6 }}
        >
          {t("goal.add.icon_label")}
        </span>
        {GOAL_ILLO_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setIllo(key)}
            style={{
              width: 36,
              height: 28,
              padding: 4,
              border: `1px solid ${
                illo === key ? "var(--forest)" : "var(--line-soft)"
              }`,
              background:
                illo === key ? "var(--forest-soft)" : "var(--stone-2)",
              borderRadius: 2,
              cursor: "pointer",
            }}
          >
            {GOAL_ILLOS[key]("#2E5C40")}
          </button>
        ))}
      </div>
      <div className="dash-row" style={{ gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="dash-btn-link"
        >
          {uploading
            ? t("goal.uploading")
            : photoUrl
            ? t("goal.change_photo")
            : t("goal.add.add_photo_optional")}
        </button>
        {photoUrl && !uploading && (
          <button
            type="button"
            onClick={() => setPhotoUrl("")}
            className="dash-btn-link"
            style={{ color: "var(--ink-3)" }}
          >
            {t("goal.remove_photo")}
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {uploadError && (
        <span
          className="dash-mono"
          style={{ fontSize: 11, color: "var(--rose)" }}
        >
          {uploadError}
        </span>
      )}
      <div className="dash-row" style={{ gap: 8 }}>
        <button
          type="button"
          className="dash-btn dash-btn-primary"
          onClick={save}
        >
          {t("goal.add.save")}
        </button>
        <button
          type="button"
          className="dash-btn dash-btn-quiet"
          onClick={onCancel}
        >
          {t("goal.cancel")}
        </button>
      </div>
    </div>
  );
}
