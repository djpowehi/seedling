"use client";

import { useEffect, useRef, useState } from "react";
import { fileToCompressedDataUrl } from "@/lib/imageUpload";
import {
  getSavingsGoal,
  removeSavingsGoal,
  setSavingsGoal,
  type SavingsGoal,
} from "@/lib/savingsGoals";

type Props = {
  familyPubkey: string;
};

export function SavingsGoalEditor({ familyPubkey }: Props) {
  const [goal, setGoal] = useState<SavingsGoal | null>(null);
  const [editing, setEditing] = useState(false);
  const [labelInput, setLabelInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [photoInput, setPhotoInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setGoal(getSavingsGoal(familyPubkey));
  }, [familyPubkey]);

  const startEditing = () => {
    setLabelInput(goal?.label ?? "");
    setAmountInput(goal ? goal.amountUsd.toString() : "");
    setPhotoInput(goal?.photoUrl ?? "");
    setUploadError(null);
    setEditing(true);
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
    setPhotoInput(result.dataUrl);
  };

  const save = () => {
    const amount = parseFloat(amountInput);
    if (!labelInput.trim() || !Number.isFinite(amount) || amount <= 0) {
      setEditing(false);
      return;
    }
    const next: SavingsGoal = {
      label: labelInput,
      amountUsd: amount,
      photoUrl: photoInput || undefined,
    };
    setSavingsGoal(familyPubkey, next);
    setGoal(next);
    setEditing(false);
  };

  const clear = () => {
    removeSavingsGoal(familyPubkey);
    setGoal(null);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex flex-col gap-2 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wider text-amber-900">
            saving for
          </span>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-stone-500 hover:text-stone-700"
          >
            cancel
          </button>
        </div>
        <input
          type="text"
          value={labelInput}
          onChange={(e) => setLabelInput(e.target.value)}
          placeholder="e.g. Nintendo Switch"
          maxLength={60}
          className="rounded-md border border-stone-300 px-2 py-1 text-sm focus:outline-none focus:border-amber-500"
        />
        <div className="flex items-center gap-2">
          <span className="text-stone-500">$</span>
          <input
            type="number"
            min="1"
            step="1"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="200"
            className="rounded-md border border-stone-300 px-2 py-1 text-sm w-24 focus:outline-none focus:border-amber-500"
          />
          <span className="text-xs text-stone-500">target</span>
        </div>
        <div className="flex items-center gap-3">
          {photoInput ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoInput}
              alt="goal preview"
              className="w-12 h-12 rounded-md object-cover bg-white border border-amber-100"
            />
          ) : (
            <div className="w-12 h-12 rounded-md bg-amber-100 border border-amber-200 flex items-center justify-center text-lg shrink-0">
              🎯
            </div>
          )}
          <div className="flex flex-col gap-1 min-w-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-amber-900 hover:text-amber-950 underline self-start disabled:opacity-50"
            >
              {uploading
                ? "uploading…"
                : photoInput
                ? "change photo"
                : "+ add a photo (optional)"}
            </button>
            {photoInput && !uploading && (
              <button
                type="button"
                onClick={() => setPhotoInput("")}
                className="text-xs text-stone-500 hover:text-stone-700 self-start"
              >
                remove photo
              </button>
            )}
            {uploadError && (
              <span className="text-xs text-red-700">{uploadError}</span>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
        </div>
        <div className="flex justify-between items-center">
          {goal ? (
            <button
              type="button"
              onClick={clear}
              className="text-xs text-red-700 hover:text-red-900 underline"
            >
              remove goal
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={save}
            className="rounded-full bg-amber-600 text-white px-3 py-1 text-xs font-medium hover:bg-amber-700"
          >
            save
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      className="text-xs text-stone-500 hover:text-stone-700 self-start underline"
    >
      {goal
        ? `goal: ${goal.label} — $${goal.amountUsd.toLocaleString()} ✎`
        : "+ set a savings goal"}
    </button>
  );
}
