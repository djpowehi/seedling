// Per-wallet localStorage cache of CPF + email used for Pix flows.
//
// 4P requires both fields on every on-ramp + off-ramp call. Asking the
// parent to retype these every time would be hostile UX; persisting
// in localStorage keyed by wallet pubkey means it's collected once
// and reused. Two parents on the same browser get separate profiles.
//
// CPF is sensitive PII but unavoidable (4P + Brazilian compliance need
// the real number). localStorage is preferable to backend storage:
// the data never leaves the device except in the request body to 4P,
// and the user can clear it at any time via the "change profile"
// affordance in the Pix form.

const KEY_PREFIX = "seedling.pix-profile.";

export interface PixProfile {
  cpf: string; // 11 digits, no formatting
  email: string;
}

function key(walletPubkey: string): string {
  return KEY_PREFIX + walletPubkey;
}

export function getPixProfile(walletPubkey: string): PixProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key(walletPubkey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PixProfile>;
    if (
      typeof parsed.cpf !== "string" ||
      parsed.cpf.length !== 11 ||
      typeof parsed.email !== "string" ||
      !parsed.email.includes("@")
    ) {
      return null;
    }
    return { cpf: parsed.cpf, email: parsed.email };
  } catch {
    return null;
  }
}

export function setPixProfile(walletPubkey: string, profile: PixProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key(walletPubkey), JSON.stringify(profile));
}

export function clearPixProfile(walletPubkey: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key(walletPubkey));
}

// CPF validation — same logic as the server route, repeated client-side
// so the user gets feedback before the network round-trip. Mirror, not
// fork: keep these two implementations in lockstep.
export function isValidCpf(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcCheck = (slice: string, weightStart: number) => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * (weightStart - i);
    }
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calcCheck(digits.slice(0, 9), 10);
  if (d1 !== Number(digits[9])) return false;
  const d2 = calcCheck(digits.slice(0, 10), 11);
  if (d2 !== Number(digits[10])) return false;

  return true;
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

// Visual formatter — turns "01927755964" into "019.277.559-64". Used
// for read-only display when the profile is already saved.
export function formatCpfForDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 11) return digits;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}
