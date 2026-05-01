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

// ──────────── URL-seeded names ────────────
//
// localStorage names don't sync across devices, so a parent who created a
// family on their laptop sees "Maria" but the kid opening the same link
// on their phone sees "friend". To bridge that, the parent's "share kid
// view" button bakes the name into the URL as `?n=<base64url>`. The kid
// view reads the param on first load, persists the decoded name into
// localStorage, then strips the param so the URL stays clean. After that,
// localStorage takes over — exact same flow as before.
//
// Tampering: anyone with the link can override the name on their own
// device. That's fine — names are display-only, never authority.

/** base64url-encode a UTF-8 string. Browser-safe; no padding. */
function b64urlEncode(s: string): string {
  if (typeof window === "undefined") return "";
  const utf8 = new TextEncoder().encode(s);
  let bin = "";
  for (const b of utf8) bin += String.fromCharCode(b);
  return window
    .btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(token: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    let s = token.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    const bin = window.atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Append the kid name to a kid-view URL as a `n=<token>` param so the
 *  kid's browser can pick it up on first load. Returns the URL unchanged
 *  if name is empty. */
export function encodeKidNameToUrl(url: string, name: string | null): string {
  const trimmed = (name ?? "").trim();
  if (trimmed.length === 0) return url;
  const token = b64urlEncode(trimmed);
  if (!token) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}n=${token}`;
}

/** Pull the name from `?n=` and decode it. Returns null if missing or
 *  malformed. Doesn't touch localStorage — caller decides. */
export function decodeKidNameFromUrl(
  searchParams: URLSearchParams
): string | null {
  const token = searchParams.get("n");
  if (!token) return null;
  const decoded = b64urlDecode(token);
  if (!decoded) return null;
  return decoded.trim().slice(0, 40) || null;
}
