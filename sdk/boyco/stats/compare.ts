import topLevelData from "./top-level-data.json";
import boycoData from "./boyco-data.json";
import boycoMarkets from './boyco-markets.json';
import { writeFileSync } from "fs";
import { overrideMarketMap } from "./market-map";

const { marketAllocations } = topLevelData;
const { data } = boycoData;
const beraPrice = 4;



interface MarketData {
    name: string;
    id: string;
    tokens: number;
    tvl: number;
    bera: number;
    apr: number;
    duration: number;
}

const beraInfo = {
    beraFDV: 2_000_000_000,
    beraSupply: 500_000_000,
};

let majorBucketWeight = 0; 
let thirdPartyBucketWeight = 0;
let majorTvl = 0;
let thirdTvl = 0;
for (const item of boycoMarkets) {
    const marketData = marketAllocations[item.market_id];
    if (!marketData) {
        continue;
    }
    if (marketData.bucket === "One") {
        thirdPartyBucketWeight += item.locked_quantity_usd * marketData.multiplier;
        thirdTvl += item.locked_quantity_usd;
    } else {
        majorBucketWeight += item.locked_quantity_usd * marketData.multiplier;
        majorTvl += item.locked_quantity_usd;
    }
}
const buckets = {
    majorBucketWeight,
    thirdPartyBucketWeight,
    majorTvl,
    thirdTvl,
    total: (majorTvl + thirdTvl).toLocaleString(),
};

console.log('Boyco API Top Level')
console.log({
    ...buckets,
    majorBucketWeight: majorBucketWeight.toLocaleString(),
    thirdPartyBucketWeight: thirdPartyBucketWeight.toLocaleString(),
    majorTvl: majorTvl.toLocaleString(),
    thirdTvl: thirdTvl.toLocaleString(),
});
console.log('');

console.log('Stats Top Level');
console.log({
  "totalTvl": "3,015,332,637.399",
  "totalPoints": "575,862,629,542.245",
  "bucketOneTvl": "2,515,019,914.938",
  "bucketOnePoints": "467,841,763,276.866",
  "bucketTwoTvl": "500,312,722.462",
  "bucketTwoPoints": "108,020,866,265.378",
});
console.log('');

let processedMarkets = 0;
function getBeraApy(
    market,
  ): { apr: number, bera: number } {
    const marketData = overrideMarketMap.find((m) => m.id === market.market_id);
    if (!marketData) {
        return { apr: 0, bera: 0 };
    }

    const multiplier = marketData.multiplier;
    processedMarkets++;
  
    const marketTVL = market.total_value_locked;
    if (!marketTVL) {
        return { apr: 0, bera: 0, };
    };
  
    const beraPrice = beraInfo.beraFDV / beraInfo.beraSupply;
  
    const lockupTime =
      Number(market.lockup_time) === 0 ? 7776000 : Number(market.lockup_time);
    const lockupPeriod = lockupTime * 1000;
    const year = 31536000000; // 365 days * 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
  
    const marketTVLMultiplied = marketTVL * multiplier;
  
    const marketTypeBucketWeight =
      marketData.assetType === "Two" 
        ? buckets.majorBucketWeight
        : buckets.thirdPartyBucketWeight;
  
    // BACKWARDS ON THE ROYCO IMPLEMENTATION (CORRECT HERE)
    const weightOfBucketOnBoyco =
      marketData.assetType === "One" ? 0.55 : 0.45;
    const beraSupplyOnBoyco = 10000000;
    const currentMarketWeight = marketTVLMultiplied / marketTypeBucketWeight;
    const beraSupplyInBucket =
      beraSupplyOnBoyco * beraPrice * weightOfBucketOnBoyco;
    const rebaseIncentives = currentMarketWeight * beraSupplyInBucket;
    const rebasedIncentiveOnMarketTVL = rebaseIncentives / marketTVL;
    const missingPeriod = year / lockupPeriod;
    const beraApy = rebasedIncentiveOnMarketTVL * missingPeriod;

    return {
        apr: beraApy,
        bera: rebaseIncentives / beraPrice,
    };
  };

async function compare() {
    // const { data: boycoData } = await axios.post("https://istbjtfzjcnstpzunkje-all.supabase.co/rest/v1/rpc/get_enriched_markets_view", {
    //     is_verified: true,
    //     page_size: 1_000,
    // }, {
    //     headers: {
    //         apiKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdGJqdGZ6amNuc3RwenVua2plIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxODc3NDUsImV4cCI6MjA1Mzc2Mzc0NX0.p74w0fxcivBLkn_P82XlRG8upTCaKQDP69YsV7Ap5t0",
    //         Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzdGJqdGZ6amNuc3RwenVua2plIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzgxODc3NDUsImV4cCI6MjA1Mzc2Mzc0NX0.p74w0fxcivBLkn_P82XlRG8upTCaKQDP69YsV7Ap5t0"
    //     },
    // });
    
    // writeFileSync("./boyco-data.json", JSON.stringify(boycoData, undefined, 2));

    const boycoMarketData: Record<string, unknown> = {};
    data.forEach((d) => boycoMarketData[d.market_id] = d);

    const missingMarkets: { name: string, id: string }[] = [];
    data.forEach((m) => {``
        if (!marketAllocations[m.market_id]) {
            missingMarkets.push({
                name: m.name,
                id: m.market_id,
            })
        }
    });

    missingMarkets.forEach((m) => delete data[m.id]);

    // Status Calcualtions
    const boycoStatsCalculation: MarketData[] = [];
    console.log({
        marketsIncluded: Object.values(marketAllocations).length,
    })
    Object.values(marketAllocations).forEach((m) => {
        const { marketId, name, usdValue, amount, duration, tokens } = m;
        const durationMultiplier = 365 / duration;
        const emittedBeraUsd = amount * beraPrice * durationMultiplier;
        const apr = (emittedBeraUsd / usdValue) * 100;
        boycoStatsCalculation.push({
            name: name.slice(0, 20),
            id: marketId,
            tokens: Number(tokens),
            tvl: usdValue,
            bera: amount,
            apr,
            duration,
        });
    })

    writeFileSync("./boyco-stats-calculation.json", JSON.stringify(boycoStatsCalculation, undefined, 2));

    console.log(`Boyco Stats Calculations`)
    console.table(boycoStatsCalculation.sort((a, b) => b.bera - a.bera).map((s) => ({
        ...s,
        tvl: `$${s.tvl.toLocaleString()}`,
        bera: s.bera.toLocaleString(),
        apr: `${s.apr.toLocaleString()}%`,
    })));
    console.log(`Bera Distributed: ${boycoStatsCalculation.reduce((t, c) => t += c.bera, 0)}`)
    console.log('');

    const boycoApiCalculations: MarketData[] = [];
    for (const item of data) {
        item.total_value_locked = Object.values(marketAllocations).find((m) => m.marketId === item.market_id)?.usdValue ?? item.total_value_locked;
        const { apr, bera } = getBeraApy(item);
        boycoApiCalculations.push({
            name: item.name,
            id: item.market_id,
            tokens: Number(item.locked_quantity),
            tvl: item.total_value_locked,
            bera,
            apr: apr * 100,
            duration: Number(item.lockup_time) / (60 * 60 * 24),
        });
    }

    writeFileSync("./boyco-api-calculation.json", JSON.stringify(boycoApiCalculations, undefined, 2));

    console.log(`Boyco API Calculations`)
    console.table(boycoApiCalculations.filter((m) => m.apr > 0).sort((a, b) => b.bera - a.bera).map((s) => ({
        ...s,
        tvl: `$${s.tvl.toLocaleString()}`,
        bera: s.bera.toLocaleString(),
        apr: `${s.apr.toLocaleString()}%`,
    })));
    console.log(`Processed Markets: ${processedMarkets}`);
    console.log(`Bera Distributed: ${boycoApiCalculations.reduce((t, c) => t += c.bera, 0)}`)
    console.log('');

    const apiMarketData = Object.fromEntries(boycoApiCalculations.map((a) => [a.id, a]));
    // const statsMarketData = Object.fromEntries(boycoStatsCalculation.map((s) => [s.id, s]));

    console.log('Comparison');
    console.table(boycoStatsCalculation.map((s) => {
        const nonDurationApr = apiMarketData[s.id].apr;
        const nonDurationTokens = apiMarketData[s.id].bera;
        return {
            name: s.name,
            // id: s.id,
            durationApr: `${s.apr.toLocaleString()}%`,
            durationAmount: s.bera,
            nonDurationApr: `${nonDurationApr.toLocaleString()}%`,
            nonDurationAmount: nonDurationTokens,
            duration: s.duration
        }
    }));
    const thirtyDayDelta = boycoStatsCalculation.filter((s) => {
      return s.duration === 30
    }).reduce((t, c) => {
      const nonDurationTokens = apiMarketData[c.id].bera;
      if (nonDurationTokens > c.bera) {
        return t + (nonDurationTokens - c.bera);
      }
      return t;
    }, 0);
    const ninetyDayDelta = boycoStatsCalculation.filter((s) => {
      return s.duration === 90
    }).reduce((t, c) => {
      const nonDurationTokens = apiMarketData[c.id].bera;
      if (nonDurationTokens > c.bera) {
        return t + (nonDurationTokens - c.bera);
      }
      return t;
    }, 0);
    console.log({
      thirtyDayDelta,
      ninetyDayDelta
    })
    const csvInputs = boycoStatsCalculation.map((s) => {
      const nonDurationApr = apiMarketData[s.id].apr;
      const nonDurationTokens = apiMarketData[s.id].bera;
      const toNonDurationDiff = nonDurationTokens - s.bera;
      return {
          name: s.name.replaceAll(',', ''),
          id: s.id,
          durationApr: `${s.apr.toLocaleString()}%`,
          durationAmount: s.bera,
          nonDurationApr: `${nonDurationApr.toLocaleString()}%`,
          nonDurationAmount: nonDurationTokens,
          duration: s.duration,
          toNonDurationDiff: toNonDurationDiff > 0 ? toNonDurationDiff : 0,
          isDeficient: toNonDurationDiff > 0,
      }
  })

  // console.log('')
  // let csv = 'name,id,duration,durationApr,durationTokens,nonDurationApr,nonDurationTokens,toNonDurationDiff,isDeficient\n';
  // console.log(csvInputs);
  // csvInputs.forEach((c) => csv = csv.concat(`${c.name},${c.id},${c.duration},${c.durationApr},${c.durationAmount},${c.nonDurationApr},${c.nonDurationAmount},${c.toNonDurationDiff},${c.isDeficient}\n`));
  // writeFileSync("./boyco-comparison.csv", csv);
}

// compare();
