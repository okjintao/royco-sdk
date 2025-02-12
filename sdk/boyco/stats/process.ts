import positionsByMarket from './data/positions-by-market.json';
import markets from './data/markets.json';
import positionsByMarketByAccount from './data/positions-by-market-by-account.json';
import { writeFileSync } from 'node:fs';

interface AccountEntitlement {
    [address: string]: {
        [marketId: string]: number;
    }
}

const totalTokens = 500_000_000;
const bucketOnePercent = 0.011;
const bucketTwoPercent = 0.009;

function processData() {
    const marketLookup = Object.fromEntries(markets.map((m) => [m.id, m]));

    let totalTvl = 0;
    let totalPoints = 0;

    let bucketOneTvl = 0;
    let bucketOnePoints = 0;
    let bucketTwoTvl = 0;
    let bucketTwoPoints = 0;

    const marketAllocations: Record<string, {
        name: string;
        marketId: string;
        tokens: number;
        usdValue: number;
        multiplier: number;
        duration: number;
        points: number;
        bucket: string;
        amount: number;
        weight: number;
    }> = {};

    for (const key of Object.keys(positionsByMarket)) {
        const marketId = key.slice(4);
        const tokens = positionsByMarket[key].inputTokenAmount;
        const usdValue = positionsByMarket[key].inputTokenAmountUSD;
        const marketData = marketLookup[marketId];
        const duration = Number(marketData.duration.split(' ')[0]);
        const points = marketData.multiplier * duration * usdValue;
        

        totalTvl += usdValue;
        totalPoints += points;

        let bucket = 'One';
        if (marketData.multiplier === 1.5 || marketData.multiplier === 1.35 || marketData.multiplier === 4.2) {
            bucketTwoTvl += usdValue;
            bucketTwoPoints += points;
            bucket = 'Two';
        } else {
            bucketOneTvl += usdValue;
            bucketOnePoints += points;
        }

        // console.log({
        //     marketId,
        //     usdValue,
        //     multiplier: marketData.multiplier,
        //     duration,
        //     points,
        //     bucket
        // });
        marketAllocations[marketId] = {
            name: marketData.name,
            marketId,
            tokens,
            usdValue,
            multiplier: marketData.multiplier,
            duration,
            points,
            bucket,
            amount: 0,
            weight: 0,
        };
    }

    const bucketOneAllocation = totalTokens * bucketOnePercent;
    const bucketTwoAllocation = totalTokens * bucketTwoPercent;

    for (const entry of Object.values(marketAllocations)) {
        let pointsPool = bucketOnePoints;
        let beraPool = bucketOneAllocation;
        if (entry.bucket === 'Two') {
            pointsPool = bucketTwoPoints;
            beraPool = bucketTwoAllocation;
        }
        const pointsPercentage = entry.points / pointsPool;
        const beraAllocation = pointsPercentage * beraPool;
        entry.amount = beraAllocation;
        entry.weight = pointsPercentage * 100;
    }

    console.log({
        totalTvl: totalTvl.toLocaleString(),
        totalPoints: totalPoints.toLocaleString(),
        bucketOneTvl: bucketOneTvl.toLocaleString(),
        bucketOnePoints: bucketOnePoints.toLocaleString(),
        bucketTwoTvl: bucketTwoTvl.toLocaleString(),
        bucketTwoPoints: bucketTwoPoints.toLocaleString(),
        marketAllocations,
        emitted: Object.values(marketAllocations).reduce((t, m) => t + m.amount, 0),
    });

    writeFileSync('top-level-data.json', JSON.stringify({
        totalTvl: totalTvl.toLocaleString(),
        totalPoints: totalPoints.toLocaleString(),
        bucketOneTvl: bucketOneTvl.toLocaleString(),
        bucketOnePoints: bucketOnePoints.toLocaleString(),
        bucketTwoTvl: bucketTwoTvl.toLocaleString(),
        bucketTwoPoints: bucketTwoPoints.toLocaleString(),
        marketAllocations,
        emitted: Object.values(marketAllocations).reduce((t, m) => t + m.amount, 0),
    }, undefined, 2));

    const accountEntitlements: AccountEntitlement = {};
    for (const entry of Object.values(positionsByMarketByAccount)) {
        if (!accountEntitlements[entry.accountAddress]) {
            accountEntitlements[entry.accountAddress] = {}
        }
        const marketId = entry.marketId.slice(4);
        if (accountEntitlements[entry.accountAddress][marketId]) {
            throw new Error('Duplicate found!');
        }
        const marketInfo = marketAllocations[marketId];
        const percentage = entry.inputTokenAmountUSD / marketInfo.usdValue;
        accountEntitlements[entry.accountAddress][marketId] = marketInfo.amount * percentage;
    }

    // const totalEvaluatedBera = Object.values(accountEntitlements).flatMap((v) => Object.values(v)).reduce((t, c) => t + c, 0);
    // console.log({
    //     totalEvaluatedBera
    // });
    writeFileSync('user-allocations.json', JSON.stringify(accountEntitlements, undefined, 2));
}

processData()
