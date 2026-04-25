// Pull devnet Kamino USDC reserve's oracle configuration via klend-sdk.
// Writes ~/refs/devnet-kamino-pubkeys.json.

import { createSolanaRpc, address as kitAddress } from "@solana/kit";
import { KaminoMarket } from "@kamino-finance/klend-sdk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const DEVNET = "https://api.devnet.solana.com";
const MAIN_MARKET = "6aaNTBEmwdN19AAdTwbNrWyUo6iEyiLguxCTePEzSqoH";

async function main() {
  const rpc = createSolanaRpc(DEVNET) as any;
  const market = await KaminoMarket.load(rpc, kitAddress(MAIN_MARKET) as any, 450);
  if (!market) throw new Error("market load failed");
  await market.loadReserves();

  const usdcReserve = market.getReserveBySymbol("USDC");
  if (!usdcReserve) throw new Error("USDC reserve missing");

  const state = usdcReserve.state;
  const tokenInfo: any = state.config.tokenInfo ?? {};
  const pythConfig: any = tokenInfo.pythConfiguration ?? {};
  const switchboardConfig: any = tokenInfo.switchboardConfiguration ?? {};
  const scopeConfig: any = tokenInfo.scopeConfiguration ?? {};

  const out = {
    network: "devnet",
    usdcReserve: usdcReserve.address.toString(),
    usdcMint: state.liquidity.mintPubkey.toString(),
    ctokenMint: state.collateral.mintPubkey.toString(),
    liquiditySupplyVault: state.liquidity.supplyVault.toString(),
    oracles: {
      pyth: pythConfig.price?.toString?.() ?? "11111111111111111111111111111111",
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
  console.log(JSON.stringify(out, null, 2));
  const outPath = path.join(
    os.homedir(),
    "refs",
    "devnet-kamino-pubkeys.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nWritten to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
