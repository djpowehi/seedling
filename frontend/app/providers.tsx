"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { ConnectionProvider } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { ToastProvider } from "@/components/Toast";
import { LocaleProvider } from "@/lib/i18n";

// Helius RPC pinned in env. Same key on free tier works for devnet AND
// mainnet — public mainnet-beta.solana.com 403s requests from browsers.
const HELIUS_KEY =
  process.env.NEXT_PUBLIC_HELIUS_RPC?.match(/api-key=([^&]+)/)?.[1] ?? "";
const DEVNET_RPC = `https://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const DEVNET_WSS = `wss://devnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const MAINNET_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const MAINNET_WSS = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;

export function Providers({ children }: { children: React.ReactNode }) {
  // External wallet connectors (Phantom / Solflare / etc.) surfaced inside
  // Privy's modal — so power users can pick their own wallet from the
  // same login screen non-crypto parents see.
  const solanaConnectors = useMemo(() => toSolanaWalletConnectors(), []);

  // Privy needs an RPC for every Solana chain enabled on the dashboard.
  // We have devnet + mainnet enabled; if either RPC is missing Privy
  // throws "No RPC configuration found for chain solana:<x>" at boot.
  const solanaRpcs = useMemo(
    () => ({
      "solana:devnet": {
        rpc: createSolanaRpc(DEVNET_RPC),
        rpcSubscriptions: createSolanaRpcSubscriptions(DEVNET_WSS),
      },
      "solana:mainnet": {
        rpc: createSolanaRpc(MAINNET_RPC),
        rpcSubscriptions: createSolanaRpcSubscriptions(MAINNET_WSS),
      },
    }),
    []
  );

  return (
    <LocaleProvider>
      <PrivyProvider
        appId={PRIVY_APP_ID}
        config={{
          appearance: {
            theme: "light",
            accentColor: "#2E5C40",
            logo: "https://seedlingsol.xyz/icon.png",
            walletChainType: "solana-only",
          },
          embeddedWallets: {
            solana: {
              createOnLogin: "users-without-wallets",
            },
            // Suppress Privy's built-in transaction-confirm modal. The
            // form-level CTA (Deposit / Withdraw / Top up) is already the
            // user's confirmation step, and Privy's modal:
            //   - Adds a second "are you sure" tap that non-crypto parents
            //     don't expect (Nubank/Venmo/Wise don't do this either)
            //   - Renders with a layout bug on iPhone where the Network
            //     row clips off the right edge ("Network: dev[truncated]")
            //   - Surfaces wallet/on-chain jargon that contradicts the
            //     "no wallet needed" brand promise
            // Tx still requires our app's deliberate ix-build + form
            // submit, so removing the popup doesn't loosen security —
            // the user explicitly chose this action with our UI.
            showWalletUIs: false,
          },
          externalWallets: {
            solana: { connectors: solanaConnectors },
          },
          solana: {
            rpcs: solanaRpcs,
          },
        }}
      >
        <ConnectionProvider endpoint={DEVNET_RPC}>
          <ToastProvider>{children}</ToastProvider>
        </ConnectionProvider>
      </PrivyProvider>
    </LocaleProvider>
  );
}
