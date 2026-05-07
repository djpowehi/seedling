// Off-chain kid Pix keys. Same shape as kidNames.ts — per-browser
// localStorage, keyed by family pubkey, never on-chain.
//
// Why off-chain: a Pix key is sensitive PII (CPF / phone / email) and
// putting it on a public ledger would be a compliance footgun. The Pix
// key only needs to leave this device when the parent triggers a
// payout, at which point it gets sent server-side to 4P along with
// the USDC transfer.
//
// Trade-off: doesn't sync across devices. Same trade-off kidNames makes.

const STORAGE_KEY = "seedling.kidPixKeys";

type PixMap = Record<string, string>;

function read(): PixMap {
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

function write(map: PixMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Quota / private mode — silent.
  }
}

export function getKidPixKey(familyPubkey: string): string | null {
  const map = read();
  const v = map[familyPubkey];
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function setKidPixKey(familyPubkey: string, key: string): void {
  const trimmed = key.trim().slice(0, 80);
  const map = read();
  if (trimmed.length === 0) {
    delete map[familyPubkey];
  } else {
    map[familyPubkey] = trimmed;
  }
  write(map);
}

export function removeKidPixKey(familyPubkey: string): void {
  const map = read();
  delete map[familyPubkey];
  write(map);
}
