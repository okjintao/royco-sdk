import positionsByMarket from './data/positions-by-market.json';
import otherMarkets from './markets.json';
import positionsByMarketByAccount from './data/positions-by-market-by-account.json';
import { writeFileSync } from 'node:fs';
import { overrideMarketMap } from './market-map';

const beraPrice = 6.75;

interface AccountEntitlement {
    [address: string]: {
        [marketId: string]: number;
    }
}

const totalTokens = 500_000_000;
const bucketOnePercent = 0.011;
const bucketTwoPercent = 0.009;

function processData() {
    const marketLookup = Object.fromEntries(otherMarkets.map((m) => [m.id.slice(4), m]));

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
        apr: number;
    }> = {};

    for (const key of Object.keys(positionsByMarket)) {
        const marketId = key.slice(4);
        const tokens = positionsByMarket[key].inputTokenAmount;
        const usdValue = positionsByMarket[key].inputTokenAmountUSD;
        const marketData = marketLookup[marketId];
        if (!marketData) {
            continue;
        }
        let duration = marketData.lockup_time ? Number(marketData.lockup_time) / (60 * 60 * 24) : 90;
        if (!marketData.lockup_time) {
            console.log(marketId);
        }
        let multiplier = overrideMarketMap.find((e) => e.id === marketId)?.multiplier;
        if (!multiplier) {
            multiplier = 1;
        }
        const points = multiplier * usdValue;
        
        totalTvl += usdValue;
        totalPoints += points;

        let bucket = 'One';
        if (multiplier === 1.5 || multiplier === 1.35 || multiplier === 4.2) {
            bucketTwoTvl += usdValue;
            bucketTwoPoints += points;
            bucket = 'Two';
        } else {
            bucketOneTvl += usdValue;
            bucketOnePoints += points;
        }

        marketAllocations[marketId] = {
            name: marketData.name,
            marketId,
            tokens,
            usdValue,
            multiplier,
            duration,
            points,
            bucket,
            amount: 0,
            weight: 0,
            apr: 0,
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
        entry.apr = (((365 / entry.duration) * beraAllocation * beraPrice) / entry.usdValue) * 100;
    }

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

    let leakedBera = 0;
    let deficientBera = 0;
    const includedMarkets = new Set();
    let thirtyDayMarkets: any[] = [];
    let ninetyDayMarkets: any[] = [];
    let tokensForThirtyDay = 0;
    let tokensForNinetyDay = 0;
    const accountEntitlements: AccountEntitlement = {};
    const thirtyDayAccountEntitlements: AccountEntitlement = {};
    const ninetyDayAccountEntitlements: AccountEntitlement = {};
    const accountPositions = {};
    for (const entry of Object.values(positionsByMarketByAccount)) {
        const marketId = entry.marketId.slice(4);
        const marketInfo = marketAllocations[marketId];
        if (!includedMarkets.has(marketId)) {
            if (marketInfo.duration === 30) {
                thirtyDayMarkets.push({
                    name: marketInfo.name,
                    marketId,
                    usdValue: marketInfo.usdValue,
                    tokens: marketInfo.amount,
                    duration: marketInfo.duration,
                });
            } else {
                ninetyDayMarkets.push({
                    name: marketInfo.name,
                    marketId,
                    usdValue: marketInfo.usdValue,
                    tokens: marketInfo.amount,
                    duration: marketInfo.duration,
                });
            }
            includedMarkets.add(marketId);
        }
        
        if (!accountPositions[entry.accountAddress]) {
            accountPositions[entry.accountAddress] = [entry];
        } else {
            accountPositions[entry.accountAddress].push(entry);
        }

        const percentage = entry.inputTokenAmountUSD / marketInfo.usdValue;
        const entitlement = marketInfo.amount * percentage;
        if (marketInfo.duration === 30) {
            if (!thirtyDayAccountEntitlements[entry.accountAddress]) {
                thirtyDayAccountEntitlements[entry.accountAddress] = {}
            }
            if (thirtyDayAccountEntitlements[entry.accountAddress][marketId]) {
                throw new Error('Duplicate found!');
            }
            thirtyDayAccountEntitlements[entry.accountAddress][marketId] = entitlement;
            tokensForThirtyDay += marketInfo.amount * percentage;
        } else {
            if (!ninetyDayAccountEntitlements[entry.accountAddress]) {
                ninetyDayAccountEntitlements[entry.accountAddress] = {}
            }
            if (ninetyDayAccountEntitlements[entry.accountAddress][marketId]) {
                throw new Error('Duplicate found!');
            }
            ninetyDayAccountEntitlements[entry.accountAddress][marketId] = entitlement;
            tokensForNinetyDay += marketInfo.amount * percentage;
        }

        if (!accountEntitlements[entry.accountAddress]) {
            accountEntitlements[entry.accountAddress] = {}
        }
        if (accountEntitlements[entry.accountAddress][marketId]) {
            throw new Error('Duplicate found!');
        }
        accountEntitlements[entry.accountAddress][marketId] = entitlement;
    }

    const totalTokensDistributed = Object.values(thirtyDayAccountEntitlements).reduce((t, c) => {
        const v = Object.values(c).reduce((t2, c2) => t2 += c2, 0);
        return t + v;
    }, 0)

    for (const [address, markets] of Object.entries(accountEntitlements)) {
        for (const [marketId, amount] of Object.entries(markets)) {
            const position = accountPositions[address].find((p) => marketId === p.marketId.slice(4));
            const duration = Number(position.lockup_time) / (60 * 60 * 24);
            const apr = (((365 / duration) * amount * beraPrice) / position.inputTokenAmountUSD) * 100;
            const expectedApr = marketAllocations[marketId].apr;
            if (apr < expectedApr * 0.99 || apr > expectedApr * 1.01) {
                throw new Error(`${marketId}, gave unexpected APR for ${address}`);
            }
        }
    }

    // const csv = 'receiverAddress,value\n';
    // for (let i = 0; i < Object.keys(thirtyDayAccountEntitlements).length; i+= 24) {
    //     const addresses = Object.keys(thirtyDayAccountEntitlements).slice(i, i + 24);
    //     const index = Math.floor(i / 24);
    //     let csvContent = csv;
    //     addresses.forEach((a) => csvContent = csvContent.concat(`${a},0.001\n`));
    //     writeFileSync(`thirty-day-distro-${index}.csv`, csvContent);
    // }

    writeFileSync('user-allocations.json', JSON.stringify(accountEntitlements, undefined, 2));
    writeFileSync('user-allocations-ninety-day.json', JSON.stringify(ninetyDayAccountEntitlements, undefined, 2));
    writeFileSync('user-allocations-thirty-day.json', JSON.stringify(thirtyDayAccountEntitlements, undefined, 2));
    console.table(thirtyDayMarkets.map((s) => ({ ...s, usdValue: s.usdValue.toLocaleString(), tokens: s.tokens.toLocaleString() })));
    const thirtyDayTvl = thirtyDayMarkets.reduce((total, c) => total += c.usdValue, 0);
    console.log(`Total TVL: ${thirtyDayTvl.toLocaleString()}`)
    console.log(`Distributed ${((tokensForThirtyDay / 10_000_000) * 100).toFixed(3)}% of Boyco`);
    console.log(`Distributed ${tokensForThirtyDay.toLocaleString()} BERA`);
    console.log(`Altered Distributed ${totalTokensDistributed.toLocaleString()} BERA`);
    console.log(`Total Claimants: ${Object.keys(thirtyDayAccountEntitlements).length}`);
    console.log('');
    console.table(ninetyDayMarkets.map((s) => ({ ...s, usdValue: s.usdValue.toLocaleString(), tokens: s.tokens.toLocaleString() })));
    const ninetyDayTvl = ninetyDayMarkets.reduce((total, c) => total += c.usdValue, 0);
    console.log(`Total TVL: ${ninetyDayTvl.toLocaleString()}`)
    console.log(`Total Claimants: ${Object.keys(ninetyDayAccountEntitlements).length}`);
    console.log(`Distributed ${((tokensForNinetyDay / 10_000_000) * 100).toFixed(3)}% of Boyco`);
    console.log(`Distributed ${tokensForNinetyDay.toLocaleString()} BERA`);

    console.log(`TotalDistribution: ${(tokensForThirtyDay + tokensForNinetyDay).toLocaleString()}`)
}

processData()
