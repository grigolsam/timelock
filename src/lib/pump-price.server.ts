// Fetches pump.fun bonding-curve data for a given mint.

export type PumpCoinData = {
  price_sol_per_token: number;
  usd_market_cap: number;
  total_supply: number;
  sol_usd_price: number;
};

type CoinResp = {
  virtual_sol_reserves?: number;
  virtual_token_reserves?: number;
  usd_market_cap?: number;
  market_cap?: number;
  total_supply?: number;
  price?: number;
};

const ENDPOINTS = [
  (m: string) => `https://frontend-api-v3.pump.fun/coins/${m}`,
  (m: string) => `https://frontend-api.pump.fun/coins/${m}`,
];

export async function getPumpCoinData(mint: string): Promise<PumpCoinData> {
  for (const build of ENDPOINTS) {
    try {
      const res = await fetch(build(mint), {
        headers: { accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as CoinResp;

      let priceSol = 0;
      if (data.virtual_sol_reserves && data.virtual_token_reserves) {
        const solReserves = data.virtual_sol_reserves / 1e9;
        const tokenReserves = data.virtual_token_reserves / 1e6;
        if (tokenReserves > 0) priceSol = solReserves / tokenReserves;
      } else if (data.price) {
        priceSol = data.price;
      }

      const totalSupply = data.total_supply ?? 1_000_000_000;
      const usdMarketCap = data.usd_market_cap ?? data.market_cap ?? priceSol * totalSupply * 180;
      const solUsdPrice =
        priceSol > 0 && totalSupply > 0 ? usdMarketCap / (priceSol * totalSupply) : 0;

      return {
        price_sol_per_token: priceSol,
        usd_market_cap: usdMarketCap,
        total_supply: totalSupply,
        sol_usd_price: solUsdPrice,
      };
    } catch {
      // try next
    }
  }
  throw new Error("Unable to fetch pump.fun coin data");
}

export async function getPumpPriceSolPerToken(mint: string): Promise<number> {
  const data = await getPumpCoinData(mint);
  return data.price_sol_per_token;
}
