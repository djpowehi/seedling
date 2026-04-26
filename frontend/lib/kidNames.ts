// Off-chain kid names. Per-browser localStorage, keyed by family pubkey
// (not kid pubkey — same kid could exist under multiple parents).
//
// Why off-chain: a 32-byte name field on FamilyPosition would require a
// program redeploy + realloc of every existing account. Names aren't
// trustless data; they're a UX nicety. localStorage is the right shape.
//
// Trade-off: names don't sync across devices. Acceptable for v1 demo.

const STORAGE_KEY = "seedling.kidNames";

type NameMap = Record<string, string>;

function read(): NameMap {
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

function write(map: NameMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / private mode — silent. Cards will fall back to pubkey.
  }
}

export function getKidName(familyPubkey: string): string | null {
  const map = read();
  const v = map[familyPubkey];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function setKidName(familyPubkey: string, name: string): void {
  const trimmed = name.trim().slice(0, 40);
  const map = read();
  if (trimmed.length === 0) {
    delete map[familyPubkey];
  } else {
    map[familyPubkey] = trimmed;
  }
  write(map);
}

export function removeKidName(familyPubkey: string): void {
  const map = read();
  delete map[familyPubkey];
  write(map);
}
