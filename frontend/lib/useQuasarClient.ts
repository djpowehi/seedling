"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { SeedlingQuasarClient } from "./quasar-client";

/**
 * Quasar TS client + connected wallet. Returns null when no wallet is
 * connected (gate on this in components, mirroring useSeedlingProgram's
 * shape so swap-over is mechanical).
 *
 * The returned `client` is a class instance with `createXxxInstruction`
 * methods that return raw `TransactionInstruction`. Wrap them in a
 * `Transaction` and send via the wallet's `sendTransaction`.
 */
export function useQuasarClient() {
  const { connection } = useConnection();
  const wallet = useWallet();

  return useMemo(() => {
    if (!wallet.connected || !wallet.publicKey || !wallet.sendTransaction) {
      return null;
    }
    const client = new SeedlingQuasarClient();
    return {
      client,
      connection,
      publicKey: wallet.publicKey,
      sendTransaction: wallet.sendTransaction,
    };
  }, [connection, wallet.connected, wallet.publicKey, wallet.sendTransaction]);
}
