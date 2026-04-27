// Off-chain savings goals. Per-browser localStorage, keyed by family pubkey.
//
// Multi-goal model: a kid can be saving for multiple things at once
// ("Switch", "bike", "concert ticket"). Each goal renders its own
// progress bar against the family's combined balance — they're not
// waterfalled or competing pools, just independent wish-list entries.
//
// Storage shape: { [familyPubkey]: SavingsGoal[] }
//
// Backwards compatibility: an earlier version stored a single
// SavingsGoal object per family (no array). The reader auto-migrates
// that shape on first access so existing localStorage entries (Maria's
// pre-multi-goal data) don't disappear after upgrade.

const STORAGE_KEY = "seedling.savingsGoals";

export type SavingsGoal = {
  id: string;
  label: string;
  amountUsd: number;
  photoUrl?: string;
};

type GoalMap = Record<string, SavingsGoal[]>;

function isLegacySingleGoal(v: unknown): v is {
  label: string;
  amountUsd: number;
  photoUrl?: string;
} {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    typeof (v as { label?: unknown }).label === "string" &&
    typeof (v as { amountUsd?: unknown }).amountUsd === "number"
  );
}

function newId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function read(): GoalMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const map: GoalMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        map[k] = v.filter(
          (g): g is SavingsGoal =>
            typeof g === "object" &&
            g !== null &&
            typeof (g as SavingsGoal).id === "string" &&
            typeof (g as SavingsGoal).label === "string" &&
            typeof (g as SavingsGoal).amountUsd === "number"
        );
      } else if (isLegacySingleGoal(v)) {
        map[k] = [{ ...v, id: newId() }];
      }
    }
    return map;
  } catch {
    return {};
  }
}

function write(map: GoalMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / private mode — silent.
  }
}

export function getSavingsGoals(familyPubkey: string): SavingsGoal[] {
  return read()[familyPubkey] ?? [];
}

export function addSavingsGoal(
  familyPubkey: string,
  goal: Omit<SavingsGoal, "id">
): SavingsGoal {
  const next: SavingsGoal = {
    id: newId(),
    label: goal.label.trim().slice(0, 60),
    amountUsd: Math.max(0, goal.amountUsd),
    photoUrl: goal.photoUrl?.trim() || undefined,
  };
  const map = read();
  map[familyPubkey] = [...(map[familyPubkey] ?? []), next];
  write(map);
  return next;
}

export function updateSavingsGoal(
  familyPubkey: string,
  id: string,
  patch: Omit<SavingsGoal, "id">
): void {
  const map = read();
  const list = map[familyPubkey] ?? [];
  map[familyPubkey] = list.map((g) =>
    g.id === id
      ? {
          id,
          label: patch.label.trim().slice(0, 60),
          amountUsd: Math.max(0, patch.amountUsd),
          photoUrl: patch.photoUrl?.trim() || undefined,
        }
      : g
  );
  write(map);
}

export function removeSavingsGoal(familyPubkey: string, id?: string): void {
  const map = read();
  if (!id) {
    delete map[familyPubkey];
  } else {
    map[familyPubkey] = (map[familyPubkey] ?? []).filter((g) => g.id !== id);
    if (map[familyPubkey].length === 0) delete map[familyPubkey];
  }
  write(map);
}
