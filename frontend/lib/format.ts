import { BN } from "@coral-xyz/anchor";
import type { PublicKey } from "@solana/web3.js";

/** "44vix4Jm…bTYN" — first 6, last 4 of base58. */
export function shortPubkey(p: PublicKey | string): string {
  const s = typeof p === "string" ? p : p.toBase58();
  if (s.length <= 12) return s;
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

/** USDC base units (6-decimals) → "$X.XX". */
export function formatUsdc(amount: BN | bigint | number): string {
  const big =
    typeof amount === "object" ? BigInt(amount.toString()) : BigInt(amount);
  const dollars = Number(big) / 1e6;
  return `$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** unix seconds → "12 days ago" / "in 3 days" / "just now". */
export function relativeTime(ts: BN | number): string {
  const seconds = typeof ts === "number" ? ts : Number(ts.toString());
  if (!seconds) return "—";
  const diff = Math.floor(Date.now() / 1000) - seconds;
  const abs = Math.abs(diff);
  const sign = diff >= 0 ? "ago" : "from now";
  if (abs < 60) return "just now";
  if (abs < 3600) return `${Math.floor(abs / 60)}m ${sign}`;
  if (abs < 86400) return `${Math.floor(abs / 3600)}h ${sign}`;
  if (abs < 86400 * 30) return `${Math.floor(abs / 86400)}d ${sign}`;
  return `${Math.floor(abs / (86400 * 30))}mo ${sign}`;
}
