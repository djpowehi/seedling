// Off-chain savings goals. Same shape as kidNames — per-browser,
// keyed by family pubkey. Goal is purely a UX target; on-chain math
// doesn't reference it.
//
// Parents set a goal in the dashboard (label + amount + optional photo
// URL). The kid view renders a progress bar against principal_remaining
// + total_yield_earned.

const STORAGE_KEY = "seedling.savingsGoals";

export type SavingsGoal = {
  label: string;
  amountUsd: number;
  photoUrl?: string;
};

type GoalMap = Record<string, SavingsGoal>;

function read(): GoalMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function write(map: GoalMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / private mode — silent. Goal disappears, that's fine.
  }
}

export function getSavingsGoal(familyPubkey: string): SavingsGoal | null {
  const map = read();
  const v = map[familyPubkey];
  if (!v || typeof v.label !== "string" || typeof v.amountUsd !== "number") {
    return null;
  }
  return v;
}

export function setSavingsGoal(familyPubkey: string, goal: SavingsGoal): void {
  // photoUrl can be either a normal URL (~200 chars) or a base64 data URL
  // from the file uploader (~20-50k chars after canvas compression). No
  // length cap — the upload helper already enforces the size budget at
  // 320×320 + JPEG-82, which keeps us well under localStorage's quota.
  const trimmed: SavingsGoal = {
    label: goal.label.trim().slice(0, 60),
    amountUsd: Math.max(0, goal.amountUsd),
    photoUrl: goal.photoUrl?.trim() || undefined,
  };
  if (!trimmed.label || trimmed.amountUsd <= 0) {
    removeSavingsGoal(familyPubkey);
    return;
  }
  const map = read();
  map[familyPubkey] = trimmed;
  write(map);
}

export function removeSavingsGoal(familyPubkey: string): void {
  const map = read();
  delete map[familyPubkey];
  write(map);
}
