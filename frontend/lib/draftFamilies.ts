// Off-chain "draft" families — saved locally when the parent presses
// "add kid" but no on-chain account exists yet. The on-chain
// FamilyPosition + KidView + kid_pool_ata only get created at the moment
// of first deposit, atomically with the deposit instruction (lazy
// creation pattern). This eliminates ghost-family subsidy: parents who
// add a kid and never deposit cost the sponsor wallet $0 instead of
// ~$0.62 in unrecoverable rent.
//
// Storage shape: per-parent list of draft kids, each with the minimum
// fields needed to (a) render the family card with name + Pix + monthly
// amount, and (b) construct the on-chain create_family instruction once
// the first deposit fires.
//
// The kid identifier here is the SAME 32-byte client-generated pubkey
// used as the v3 family/kid PDA seed. Once the family is promoted to
// on-chain, the draft entry is removed and the on-chain account takes
// over — keyed by the same `familyPositionPda(parent, kid)` so
// kidNames / kidPix / savingsGoals localStorage helpers continue to
// work without modification.

const STORAGE_KEY = "seedling.draftFamilies";

/** Schema persisted to localStorage. Versioned via wrapper so a future
 *  migration can read the old shape, transform, and write the new. */
type DraftFamilyRecord = {
  parent: string; // base58
  kid: string; // base58 — client-generated, no associated keypair
  monthlyUsd: number; // for display + becomes streamRate at create time
  createdAt: number; // unix seconds
};

type DraftMap = Record<string, DraftFamilyRecord[]>; // parentBase58 → drafts

export type DraftFamily = DraftFamilyRecord;

function read(): DraftMap {
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

function write(map: DraftMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota or private mode — silent. Caller proceeds; the kid won't
    // persist but the in-memory state of this session still works.
  }
}

/** All drafts for a parent, oldest-first. Empty list when none. */
export function getDraftFamilies(parentB58: string): DraftFamily[] {
  const map = read();
  const list = map[parentB58];
  return Array.isArray(list) ? list : [];
}

/** Append a draft. No-op if a draft with the same kid already exists for
 *  this parent — the AddKidForm should have caught the duplicate already
 *  but we double-guard here so callers don't need to dedupe. */
export function addDraftFamily(draft: DraftFamily): void {
  const map = read();
  const existing = map[draft.parent] ?? [];
  if (existing.some((d) => d.kid === draft.kid)) return;
  map[draft.parent] = [...existing, draft];
  write(map);
}

/** Remove a draft by kid pubkey. Used when:
 *  (a) user manually removes the kid before first deposit (free path), or
 *  (b) the on-chain family appeared (deposit promoted draft → real). */
export function removeDraftFamily(parentB58: string, kidB58: string): void {
  const map = read();
  const existing = map[parentB58];
  if (!Array.isArray(existing)) return;
  const filtered = existing.filter((d) => d.kid !== kidB58);
  if (filtered.length === existing.length) return; // nothing changed
  if (filtered.length === 0) {
    delete map[parentB58];
  } else {
    map[parentB58] = filtered;
  }
  write(map);
}

/** Update the monthly USD amount on a draft (edit flow before first
 *  deposit). No-op if no draft matches. */
export function updateDraftMonthly(
  parentB58: string,
  kidB58: string,
  monthlyUsd: number
): void {
  const map = read();
  const existing = map[parentB58];
  if (!Array.isArray(existing)) return;
  const idx = existing.findIndex((d) => d.kid === kidB58);
  if (idx < 0) return;
  existing[idx] = { ...existing[idx], monthlyUsd };
  map[parentB58] = existing;
  write(map);
}
