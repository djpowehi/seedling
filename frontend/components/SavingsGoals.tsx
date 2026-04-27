"use client";

import { useEffect, useRef, useState } from "react";
import type { BN } from "@coral-xyz/anchor";
import { fileToCompressedDataUrl } from "@/lib/imageUpload";
import {
  addSavingsGoal,
  getSavingsGoals,
  removeSavingsGoal,
  updateSavingsGoal,
  type SavingsGoal,
} from "@/lib/savingsGoals";

type Props = {
  familyPubkey: string;
  // Combined balance = principal_remaining + total_yield_earned (USDC base units).
  combinedBalance: BN;
  // Parent view: editable=true. Kid view: editable=false (read-only cards).
  editable?: boolean;
  // When no goals exist and editable=false, hide the empty placeholder.
  showEmptyPlaceholder?: boolean;
};

type EditingState = { kind: "new" } | { kind: "edit"; id: string } | null;

export function SavingsGoals({
  familyPubkey,
  combinedBalance,
  editable = false,
  showEmptyPlaceholder = true,
}: Props) {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [editing, setEditing] = useState<EditingState>(null);

  useEffect(() => {
    setGoals(getSavingsGoals(familyPubkey));
  }, [familyPubkey]);

  const refresh = () => setGoals(getSavingsGoals(familyPubkey));
  const balanceUsd = Number(combinedBalance.toString()) / 1_000_000;

  if (goals.length === 0 && !editing) {
    if (editable) {
      return (
        <button
          type="button"
          onClick={() => setEditing({ kind: "new" })}
          className="text-xs text-stone-500 hover:text-stone-700 self-start underline"
        >
          + set a savings goal
        </button>
      );
    }
    if (!showEmptyPlaceholder) return null;
    return (
      <section className="rounded-2xl bg-stone-50 border border-stone-200 p-5 flex flex-col gap-2">
        <span className="text-xs uppercase tracking-wider text-stone-500">
          saving for
        </span>
        <span className="text-sm text-stone-500 italic">
          ask your parent to set a goal
        </span>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {goals.map((goal) =>
        editing && editing.kind === "edit" && editing.id === goal.id ? (
          <GoalForm
            key={goal.id}
            initial={goal}
            onCancel={() => setEditing(null)}
            onSave={(patch) => {
              updateSavingsGoal(familyPubkey, goal.id, patch);
              refresh();
              setEditing(null);
            }}
            onDelete={() => {
              removeSavingsGoal(familyPubkey, goal.id);
              refresh();
              setEditing(null);
            }}
          />
        ) : (
          <GoalCard
            key={goal.id}
            goal={goal}
            balanceUsd={balanceUsd}
            editable={editable}
            onEdit={() => setEditing({ kind: "edit", id: goal.id })}
          />
        )
      )}
      {editing && editing.kind === "new" && (
        <GoalForm
          onCancel={() => setEditing(null)}
          onSave={(patch) => {
            addSavingsGoal(familyPubkey, patch);
            refresh();
            setEditing(null);
          }}
        />
      )}
      {editable && !editing && (
        <button
          type="button"
          onClick={() => setEditing({ kind: "new" })}
          className="text-xs text-amber-800 hover:text-amber-900 underline self-start"
        >
          + add another goal
        </button>
      )}
    </div>
  );
}

type GoalCardProps = {
  goal: SavingsGoal;
  balanceUsd: number;
  editable: boolean;
  onEdit: () => void;
};

function GoalCard({ goal, balanceUsd, editable, onEdit }: GoalCardProps) {
  const [imgOk, setImgOk] = useState(true);
  const pct = Math.min(100, (balanceUsd / goal.amountUsd) * 100);
  const reached = pct >= 100;

  const inner = (
    <>
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-amber-900">
          saving for
        </span>
        <span className="text-xs text-stone-500 tabular-nums flex items-center gap-2">
          <span>
            ${balanceUsd.toFixed(2)} of ${goal.amountUsd.toLocaleString()}
          </span>
          {editable && <span className="text-stone-400">✎</span>}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {goal.photoUrl && imgOk ? (
          <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-white border border-amber-100 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={goal.photoUrl}
              alt={goal.label}
              className="w-full h-full object-cover"
              onError={() => setImgOk(false)}
              referrerPolicy="no-referrer"
            />
          </div>
        ) : (
          <div className="w-16 h-16 rounded-xl bg-amber-100 border border-amber-200 shrink-0 flex items-center justify-center text-2xl">
            🎯
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-base font-medium text-emerald-900 truncate">
            {goal.label}
          </div>
          <div className="mt-2 h-2 rounded-full bg-stone-200 overflow-hidden">
            <div
              className={`h-full ${
                reached ? "bg-emerald-500" : "bg-amber-500"
              } transition-all duration-500`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-1 text-xs text-stone-600 tabular-nums">
            {reached ? "you did it! 🎉" : `${pct.toFixed(1)}%`}
          </div>
        </div>
      </div>
    </>
  );

  if (editable) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="rounded-2xl bg-amber-50/60 border border-amber-200 p-5 flex flex-col gap-3 shadow-sm text-left hover:bg-amber-50 transition-colors"
        aria-label={`Edit goal: ${goal.label}`}
      >
        {inner}
      </button>
    );
  }
  return (
    <section className="rounded-2xl bg-amber-50/60 border border-amber-200 p-5 flex flex-col gap-3 shadow-sm">
      {inner}
    </section>
  );
}

type GoalFormProps = {
  initial?: SavingsGoal;
  onCancel: () => void;
  onSave: (patch: Omit<SavingsGoal, "id">) => void;
  onDelete?: () => void;
};

function GoalForm({ initial, onCancel, onSave, onDelete }: GoalFormProps) {
  const [labelInput, setLabelInput] = useState(initial?.label ?? "");
  const [amountInput, setAmountInput] = useState(
    initial ? initial.amountUsd.toString() : ""
  );
  const [photoInput, setPhotoInput] = useState(initial?.photoUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      onCancel();
      return;
    }
    onSave({
      label: labelInput,
      amountUsd: amount,
      photoUrl: photoInput || undefined,
    });
  };

  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 flex flex-col gap-3 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wider text-amber-900">
          {initial ? "edit goal" : "saving for"}
        </span>
        <button
          type="button"
          onClick={onCancel}
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
        autoFocus
        className="rounded-md border border-stone-300 px-2 py-1.5 text-sm focus:outline-none focus:border-amber-500"
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
          className="rounded-md border border-stone-300 px-2 py-1.5 text-sm w-24 focus:outline-none focus:border-amber-500"
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
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className="text-xs text-red-700 hover:text-red-900 underline"
          >
            delete this goal
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={save}
          className="rounded-full bg-amber-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-amber-700"
        >
          save
        </button>
      </div>
    </div>
  );
}
