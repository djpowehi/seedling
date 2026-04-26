"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    setGoal(getSavingsGoal(familyPubkey));
  }, [familyPubkey]);

  const startEditing = () => {
    setLabelInput(goal?.label ?? "");
    setAmountInput(goal ? goal.amountUsd.toString() : "");
    setPhotoInput(goal?.photoUrl ?? "");
    setEditing(true);
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
        <input
          type="url"
          value={photoInput}
          onChange={(e) => setPhotoInput(e.target.value)}
          placeholder="https://… (optional photo of the goal)"
          className="rounded-md border border-stone-300 px-2 py-1 text-xs focus:outline-none focus:border-amber-500"
        />
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
