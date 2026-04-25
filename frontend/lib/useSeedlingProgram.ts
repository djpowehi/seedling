"use client";

import { AnchorProvider } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { getProgram } from "./program";

/**
 * Memoized AnchorProvider + Program instance bound to the connected wallet.
 * Returns `null` when no wallet is connected — components should gate on this.
 */
export function useSeedlingProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    if (!wallet) return null;
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    return { provider, program: getProgram(provider), wallet };
  }, [connection, wallet]);
}
