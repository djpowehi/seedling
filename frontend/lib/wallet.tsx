"use client";

// Compat shim: surfaces Privy's Solana wallets through the same
// `{ publicKey, connected, sendTransaction }` shape the rest of the
// codebase used to read from `@solana/wallet-adapter-react`.
//
// Why a shim instead of refactoring every form:
//   - 8 call-sites already use the wallet-adapter shape
//   - migrating to Privy hooks form-by-form is mechanical busywork
//   - Privy and adapter both wrap the same primitive (sign + broadcast),
//     so a thin façade keeps the diff minimal and the testing surface flat

import { usePrivy, useLogout } from "@privy-io/react-auth";
import {
  useWallets as usePrivyWallets,
  useSignAndSendTransaction,
  useSignTransaction,
} from "@privy-io/react-auth/solana";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { useCallback, useMemo } from "react";

export type SeedlingWallet = {
  publicKey: PublicKey | null;
  connected: boolean;
  ready: boolean;
  sendTransaction: (
    tx: Transaction | VersionedTransaction,
    connection: Connection
  ) => Promise<string>;
  /** Sign-only — returns the partially-signed tx without broadcasting.
   *  Used by the create_family relay flow where the server then adds
   *  the sponsor (fee_payer) signature and broadcasts. */
  signTransaction: <T extends Transaction | VersionedTransaction>(
    tx: T
  ) => Promise<T>;
  disconnect: () => Promise<void>;
};

export function useSeedlingWallet(): SeedlingWallet {
  const { ready: privyReady, authenticated } = usePrivy();
  const { logout } = useLogout();
  const { wallets, ready: walletsReady } = usePrivyWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const { signTransaction: privySignTransaction } = useSignTransaction();

  // Prefer the embedded wallet (the one Privy created on signup); fall
  // back to whichever external wallet they connected first.
  const wallet = useMemo(() => {
    if (!wallets.length) return null;
    const embedded = wallets.find((w) => w.standardWallet?.name === "Privy");
    return embedded ?? wallets[0];
  }, [wallets]);

  const publicKey = useMemo(
    () => (wallet ? new PublicKey(wallet.address) : null),
    [wallet]
  );

  const sendTransaction = useCallback(
    async (
      tx: Transaction | VersionedTransaction,
      connection: Connection
    ): Promise<string> => {
      if (!wallet || !publicKey) {
        throw new Error("Wallet not connected");
      }

      // Legacy `Transaction` is mutable; if the caller didn't set
      // blockhash/feePayer (the wallet-adapter happily defaulted these),
      // do it now so the same call-sites keep working.
      if (tx instanceof Transaction) {
        if (!tx.recentBlockhash) {
          const { blockhash } = await connection.getLatestBlockhash();
          tx.recentBlockhash = blockhash;
        }
        if (!tx.feePayer) {
          tx.feePayer = publicKey;
        }
      }

      const serialized =
        tx instanceof VersionedTransaction
          ? tx.serialize()
          : tx.serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            });

      const { signature } = await signAndSendTransaction({
        transaction: new Uint8Array(serialized),
        wallet,
        chain: "solana:devnet",
      });

      return bs58.encode(signature);
    },
    [wallet, publicKey, signAndSendTransaction]
  );

  const signTransaction = useCallback(
    async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (!wallet) throw new Error("Wallet not connected");

      const serialized =
        tx instanceof VersionedTransaction
          ? tx.serialize()
          : tx.serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            });

      const { signedTransaction } = await privySignTransaction({
        transaction: new Uint8Array(serialized),
        wallet,
        chain: "solana:devnet",
      });

      // Privy returns a fully-serialized tx with the user's signature
      // attached. Re-deserialize back into the input type so the caller
      // can keep working with the same shape (e.g., Transaction methods).
      if (tx instanceof VersionedTransaction) {
        return VersionedTransaction.deserialize(signedTransaction) as T;
      }
      return Transaction.from(signedTransaction) as T;
    },
    [wallet, privySignTransaction]
  );

  const disconnect = useCallback(async () => {
    await logout();
  }, [logout]);

  return {
    publicKey,
    connected: authenticated && !!wallet,
    ready: privyReady && walletsReady,
    sendTransaction,
    signTransaction,
    disconnect,
  };
}
