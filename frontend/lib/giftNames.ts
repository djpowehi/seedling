// Off-chain mapping of depositor wallet → human name. Set by the parent
// when an unknown gift first appears ("Who is this? Grandma."). Read by
// the kid view's gift wall so visitors see "Grandma · $20 · 2 days ago"
// instead of a truncated pubkey.
//
// Keyed per-family. localStorage scope is global, but parents who manage
// multiple kids may call the same person ("Grandma") differently in each
// kid's view, so we don't share keys across families.

const KEY_PREFIX = "seedling-gift-names-";

export type GiftNames = Record<string, string>;

export function getGiftNames(familyPda: string): GiftNames {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY_PREFIX + familyPda);
    return raw ? (JSON.parse(raw) as GiftNames) : {};
  } catch {
    return {};
  }
}

export function setGiftName(
  familyPda: string,
  depositor: string,
  name: string
): void {
  if (typeof window === "undefined") return;
  const map = getGiftNames(familyPda);
  map[depositor] = name;
  window.localStorage.setItem(KEY_PREFIX + familyPda, JSON.stringify(map));
}

export function shortPubkey(pk: string): string {
  return pk.slice(0, 4) + "…" + pk.slice(-4);
}

export function timeAgo(unixSec: number): string {
  const delta = Math.floor(Date.now() / 1000) - unixSec;
  if (delta < 60) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86_400) {
    // Add minute precision so 5 gifts within the same hour don't all read
    // identically. "2h 7m ago" vs "2h 12m ago" is more useful than "2h".
    const h = Math.floor(delta / 3600);
    const m = Math.floor((delta % 3600) / 60);
    return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
  }
  if (delta < 30 * 86_400) {
    const d = Math.floor(delta / 86_400);
    const h = Math.floor((delta % 86_400) / 3600);
    return h > 0 ? `${d}d ${h}h ago` : `${d}d ago`;
  }
  return `${Math.floor(delta / (30 * 86_400))}mo ago`;
}
