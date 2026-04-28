"use client";

import { useEffect, useRef, useState } from "react";
import { fileToCompressedDataUrl } from "@/lib/imageUpload";
import {
  type SavingsGoal,
  removeSavingsGoal,
  updateSavingsGoal,
} from "@/lib/savingsGoals";
import { GOAL_ILLOS, type GoalIlloKey } from "./icons";

type Props = {
  familyPubkey: string;
  goal: SavingsGoal;
  combinedBalanceUsd: number;
  editing: boolean;
  onEditStart: () => void;
  onEditEnd: () => void;
  onChange: () => void;
};

function resolveIllo(key: string | undefined): GoalIlloKey {
  if (!key) return "default";
  const k = key as GoalIlloKey;
  return k in GOAL_ILLOS ? k : "default";
}

export function GoalRow({
  familyPubkey,
  goal,
  combinedBalanceUsd,
  editing,
  onEditStart,
  onEditEnd,
  onChange,
}: Props) {
  const [labelDraft, setLabelDraft] = useState(goal.label);
  const [targetDraft, setTargetDraft] = useState(goal.amountUsd.toString());
  const [photoDraft, setPhotoDraft] = useState(goal.photoUrl ?? "");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setLabelDraft(goal.label);
      setTargetDraft(goal.amountUsd.toString());
      setPhotoDraft(goal.photoUrl ?? "");
      setUploadError(null);
      setTimeout(() => labelInputRef.current?.focus(), 0);
    }
  }, [editing, goal.label, goal.amountUsd, goal.photoUrl]);

  const pct = Math.min(100, (combinedBalanceUsd / goal.amountUsd) * 100);

  const save = () => {
    const amount = parseFloat(targetDraft);
    if (!labelDraft.trim() || !Number.isFinite(amount) || amount <= 0) {
      onEditEnd();
      return;
    }
    updateSavingsGoal(familyPubkey, goal.id, {
      label: labelDraft,
      amountUsd: amount,
      photoUrl: photoDraft || undefined,
    });
    onChange();
    onEditEnd();
  };

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
    setPhotoDraft(result.dataUrl);
  };

  const remove = () => {
    if (window.confirm(`Remove the "${goal.label}" goal?`)) {
      removeSavingsGoal(familyPubkey, goal.id);
      onChange();
      onEditEnd();
    }
  };

  // Pick an illustration: by saved key, or fallback to default.
  const illoKey = resolveIllo(goal.illo);
  const Illo = GOAL_ILLOS[illoKey];

  return (
    <div
      className="dash-row"
      style={{
        gap: 16,
        alignItems: "center",
        padding: "12px 0",
        borderTop: "1px solid var(--line-soft)",
        cursor: editing ? "default" : "pointer",
      }}
      onClick={() => !editing && onEditStart()}
    >
      <div
        style={{
          width: 64,
          height: 48,
          flex: "0 0 64px",
          background: "var(--stone-2)",
          border: "1px solid var(--line-soft)",
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: goal.photoUrl ? 0 : 4,
          overflow: "hidden",
        }}
      >
        {goal.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={goal.photoUrl}
            alt={goal.label}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            referrerPolicy="no-referrer"
          />
        ) : (
          Illo("#2E5C40")
        )}
      </div>

      <div className="dash-col" style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <div
          className="dash-row"
          style={{
            alignItems: "baseline",
            gap: 10,
            justifyContent: "space-between",
          }}
        >
          {editing ? (
            <input
              ref={labelInputRef}
              className="dash-rename-input"
              style={{
                fontSize: 17,
                lineHeight: 1.2,
                fontFamily: "var(--font-instrument-serif), serif",
              }}
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") onEditEnd();
              }}
            />
          ) : (
            <span
              className="dash-serif"
              style={{ fontSize: 17, lineHeight: 1.2, color: "var(--ink)" }}
            >
              {goal.label}
            </span>
          )}
          <span
            className="dash-mono"
            style={{
              fontSize: 11,
              color: "var(--ink-3)",
              whiteSpace: "nowrap",
            }}
          >
            ${combinedBalanceUsd.toFixed(2)}{" "}
            <span style={{ opacity: 0.55 }}>/ </span>
            {editing ? (
              <input
                type="number"
                className="dash-rename-input dash-mono"
                style={{
                  fontSize: 11,
                  width: 60,
                  textAlign: "right",
                  display: "inline-block",
                  fontFamily: "var(--font-jetbrains-mono), monospace",
                }}
                value={targetDraft}
                min={1}
                onChange={(e) => setTargetDraft(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              `$${goal.amountUsd.toLocaleString()}`
            )}
          </span>
        </div>
        <div className="dash-progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="dash-row" style={{ justifyContent: "space-between" }}>
          <span
            className="dash-mono"
            style={{
              fontSize: 10,
              color: "var(--ink-3)",
              letterSpacing: "0.04em",
            }}
          >
            {Math.round(pct)}% saved
          </span>
          <span
            className="dash-mono"
            style={{
              fontSize: 10,
              color: "var(--ink-3)",
              letterSpacing: "0.04em",
            }}
          >
            {editing ? "press enter to save" : "click to edit"}
          </span>
        </div>

        {editing && (
          <div
            className="dash-col"
            style={{
              gap: 8,
              marginTop: 6,
              padding: "8px 0",
              borderTop: "1px dashed var(--line-soft)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dash-row" style={{ gap: 8, alignItems: "center" }}>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="dash-btn-link"
              >
                {uploading
                  ? "uploading…"
                  : photoDraft
                  ? "change photo"
                  : "+ add photo"}
              </button>
              {photoDraft && !uploading && (
                <button
                  type="button"
                  onClick={() => setPhotoDraft("")}
                  className="dash-btn-link"
                  style={{ color: "var(--ink-3)" }}
                >
                  remove photo
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
                onClick={save}
                className="dash-btn dash-btn-primary"
                style={{ fontSize: 12, padding: "8px 12px" }}
              >
                save
              </button>
              <button
                type="button"
                onClick={onEditEnd}
                className="dash-btn dash-btn-quiet"
                style={{ fontSize: 12 }}
              >
                cancel
              </button>
              <button
                type="button"
                onClick={remove}
                className="dash-btn-link dash-btn-link-danger"
                style={{ marginLeft: "auto" }}
              >
                delete this goal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
