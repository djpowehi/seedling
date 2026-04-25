// Step 1.2 of Day 4: pull all Kamino USDC mainnet pubkeys we need to clone
// into Surfpool. Output goes to ~/refs/mainnet-kamino-pubkeys.json — keep it,
// every Surfpool session reads from it.
//
// Run: npx tsx src/get-mainnet-pubkeys.ts
// Output: prints to stdout AND writes ~/refs/mainnet-kamino-pubkeys.json

import { createSolanaRpc, address as kitAddress } from "@solana/kit";
import { KaminoMarket } from "@kamino-finance/klend-sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Helius public mainnet RPC. If rate-limited, swap for QuickNode / Helius w/ key.
const MAINNET = "https://api.mainnet-beta.solana.com";
const MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";

async function main() {
  const rpc = createSolanaRpc(MAINNET) as any;
  console.log(`Loading market ${MAIN_MARKET} from mainnet...`);
  const market = await KaminoMarket.load(
    rpc,
    kitAddress(MAIN_MARKET) as any,
    450
  );
  if (!market) {
    console.error("Failed to load main market");
    process.exit(1);
  }
  await market.loadReserves();

  const usdcReserve = market.getReserveBySymbol("USDC");
  if (!usdcReserve) {
    console.error("USDC reserve not found in main market");
    process.exit(2);
  }

  const state = usdcReserve.state;
  const liquidity = state.liquidity;
  const collateral = state.collateral;
  const config = state.config;

  // Oracle pubkeys live deep in config.tokenInfo. Different oracle types live
  // at different keys. Pull them all; the program treats zero-pubkey as "unused".
  const tokenInfo: any = config.tokenInfo ?? {};
  const pythConfig: any = tokenInfo.pythConfiguration ?? {};
  const switchboardConfig: any = tokenInfo.switchboardConfiguration ?? {};
  const scopeConfig: any = tokenInfo.scopeConfiguration ?? {};

  const out = {
    network: "mainnet",
    pulledAt: new Date().toISOString(),
    klendProgramId: "KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD",
    mainMarket: MAIN_MARKET,
    usdcReserve: usdcReserve.address.toString(),
    usdcMint: liquidity.mintPubkey.toString(),
    ctokenMint: collateral.mintPubkey.toString(),
    liquiditySupplyVault: liquidity.supplyVault.toString(),
    collateralSupplyVault: collateral.supplyVault.toString(),
    feeVault: liquidity.feeVault.toString(),
    lendingMarket: state.lendingMarket.toString(),
    oracles: {
      pyth:
        pythConfig.price?.toString?.() ?? "11111111111111111111111111111111",
      switchboardPrice:
        switchboardConfig.priceAggregator?.toString?.() ??
        "11111111111111111111111111111111",
      switchboardTwap:
        switchboardConfig.twapAggregator?.toString?.() ??
        "11111111111111111111111111111111",
      scopeConfig:
        scopeConfig.priceFeed?.toString?.() ??
        "11111111111111111111111111111111",
    },
  };

  console.log("\n--- Mainnet Kamino USDC pubkeys ---");
  console.log(JSON.stringify(out, null, 2));

  // Write to ~/refs/
  const refsDir = path.join(os.homedir(), "refs");
  fs.mkdirSync(refsDir, { recursive: true });
  const outPath = path.join(refsDir, "mainnet-kamino-pubkeys.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWritten to: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(99);
});
