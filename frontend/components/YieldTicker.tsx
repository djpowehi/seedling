"use client";

import { useEffect, useRef, useState } from "react";
import { Connection } from "@solana/web3.js";
import { DEVNET_ADDRESSES, DEVNET_RPC } from "@/lib/program";
import { fetchFamilyByPda, fetchVaultClock } from "@/lib/fetchFamilyByPda";
import type { FamilyView } from "@/lib/fetchFamilies";

const ESTIMATED_APY = 0.08;
const YEAR_SECONDS = 365 * 86_400;
const RECALIBRATE_MS = 30_000;
const TICK_MS = 100; // smooth, but cheap on CPU

type Props = {
  family: FamilyView;
  initialClock: {
    totalShares: bigint;
    lastKnownTotalAssets: bigint;
  };
};

/**
 * family_assets = (family.shares / vault_config.total_shares) × last_known_total_assets
 *
 * The on-chain value is only refreshed at cToken-redeem events (deposit,
 * withdraw, distribute). Between those, Kamino is accruing real yield
 * that Seedling doesn't know about. We project forward at the estimated
 * APY so the ticker animates between server reads. Labeled "estimated"
 * because that's exactly what it is.
 */
function computeFamilyAssetsBaseUnits(
  shares: bigint,
  totalShares: bigint,
  totalAssets: bigint
): bigint {
  if (totalShares === BigInt(0)) return BigInt(0);
  // floor — same direction Kamino's redeem rounds.
  return (shares * totalAssets) / totalShares;
}

function baseUnitsToUsd(baseUnits: bigint): number {
  return Number(baseUnits) / 1_000_000;
}

export function YieldTicker({ family, initialClock }: Props) {
  // Snapshots refreshed every RECALIBRATE_MS.
  const [snapshot, setSnapshot] = useState({
    familyAssets: computeFamilyAssetsBaseUnits(
      BigInt(family.shares.toString()),
      initialClock.totalShares,
      initialClock.lastKnownTotalAssets
    ),
    snapshotMs: Date.now(),
  });
  // Smoothly-ticking projected value, formatted for display.
  const [displayUsd, setDisplayUsd] = useState(() =>
    baseUnitsToUsd(snapshot.familyAssets)
  );
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;

  // Background recalibration.
  useEffect(() => {
    let cancelled = false;
    const connection = new Connection(DEVNET_RPC, "confirmed");
    const recalibrate = async () => {
      try {
        const [fam, clk] = await Promise.all([
          fetchFamilyByPda(connection, family.pubkey),
          fetchVaultClock(connection, DEVNET_ADDRESSES.vaultConfig),
        ]);
        if (cancelled || !fam || !clk) return;
        setSnapshot({
          familyAssets: computeFamilyAssetsBaseUnits(
            BigInt(fam.shares.toString()),
            clk.totalShares,
            clk.lastKnownTotalAssets
          ),
          snapshotMs: Date.now(),
        });
      } catch {
        // Silent retry on next tick. The displayed value continues
        // projecting from the last good snapshot.
      }
    };
    const interval = setInterval(recalibrate, RECALIBRATE_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [family.pubkey]);

  // Smooth visual tick. Projects forward at ESTIMATED_APY between recalibrations.
  useEffect(() => {
    const tick = () => {
      const s = snapshotRef.current;
      const elapsedSec = (Date.now() - s.snapshotMs) / 1000;
      const familyAssetsUsd = baseUnitsToUsd(s.familyAssets);
      const perSecond = (familyAssetsUsd * ESTIMATED_APY) / YEAR_SECONDS;
      setDisplayUsd(familyAssetsUsd + perSecond * elapsedSec);
    };
    tick();
    const interval = setInterval(tick, TICK_MS);
    return () => clearInterval(interval);
  }, []);

  const formatted = displayUsd.toLocaleString("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-xs uppercase tracking-widest text-stone-500">
        your money, right now
      </span>
      <span className="text-5xl font-semibold text-emerald-900 tabular-nums">
        ${formatted}
      </span>
      <span
        className="text-xs text-stone-400"
        title="Kamino's actual yield is harvested at deposit/withdraw/distribute events. Between those, this ticker projects forward at an estimated 8% APY based on Kamino's recent rate."
      >
        growing at ~8% APY (estimated)
      </span>
    </div>
  );
}
