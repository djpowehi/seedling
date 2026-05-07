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

/** Detected Pix-key kind. Used to decide which display formatter applies. */
export type PixKeyKind = "cpf" | "email" | "phone" | "unknown";

export function detectPixKeyKind(raw: string): PixKeyKind {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) return "email";
  if (trimmed.startsWith("+")) return "phone";
  // No @ and no + — treat as CPF if it's 11 digits after stripping mask.
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 11) return "cpf";
  return "unknown";
}

/** Render a Pix key for display: format CPFs as XXX.XXX.XXX-XX, leave
 *  emails and phones as-is. Truncate long emails so they don't blow
 *  the card layout. */
export function formatPixKeyForDisplay(raw: string): string {
  const trimmed = raw.trim();
  switch (detectPixKeyKind(trimmed)) {
    case "cpf": {
      const digits = trimmed.replace(/\D/g, "");
      // Reuse existing formatter via dynamic import path — the inline
      // version is identical to formatCpfForDisplay in pixProfile.ts.
      return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(
        6,
        9
      )}-${digits.slice(9)}`;
    }
    case "email":
      return trimmed.length > 28 ? trimmed.slice(0, 25) + "…" : trimmed;
    case "phone":
      return trimmed;
    default:
      return trimmed;
  }
}
