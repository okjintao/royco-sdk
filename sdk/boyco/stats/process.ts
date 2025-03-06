import positionsByMarket from './data/positions-by-market.json';
import otherMarkets from './markets.json';
import positionsByMarketByAccount from './data/positions-by-market-by-account.json';
import { writeFileSync } from 'node:fs';
import { overrideMarketMap } from './compare';
// import { Contract, ethers } from 'ethers';
// import { hexZeroPad } from 'ethers/lib/utils';

// const provider = new ethers.providers.JsonRpcProvider("https://rpc.berachain.com");
// const filter = {
//     address: "0xe62987D430030C0A65BcE3C3cEE0F6F282ee4908",
//     topics: [
//         ethers.utils.id("RewardClaimed(bytes32,address,address,uint256)"),
//     ]
// };

// const abi = [
//     "event RewardClaimed(bytes32 indexed identifier, address indexed token, address indexed account, uint256 amount)"
//   ];
  
// const contract = new Contract("0xe62987D430030C0A65BcE3C3cEE0F6F282ee4908", abi, provider);
// const result = await contract.queryFilter(filter);
// console.log(result);

const claims = Object.fromEntries(Object.entries({
    ["0x9999b99AD237BaB0Dc8fd7aaf2CAceB7A8A89999"]: 4.943677709305667633,
    "0xD248d2f09bFbe04e67fC7Fea08828D6AD6d95B6D": 8.39970015739336706,
    "0xB168Eb2D0cBa59D1F59fB6f74520190Ec21C192f": 0.829995600780398356,
    "0x4e937183B50f506e2D954948c588722dA0B2032E": 66.656538932200064096,
    "0x546dcBD40E6FB1950a63FEF7C5c6b3eC296d7DBD": 0.042676758552912467,
    "0x6B1769815Ab6556959999272CDe36C6062F3A3d8": 0.032850151385852843,
    "0x14975679e5f87c25fa2c54958e735a79B5B93043": 195.748763971717977488, 
    "0x154bEAFe33c12230f2b4cc758ec0eC41a65bA7Dc": 0.151561090715948088,
    "0xeD594251d28AfeE844955D774e4FeE186F012D51": 1.010911566907401359,
    "0xafCCb21e51B27B09272A0bf4D204623E706CDB39": 7.684775760950116385,
    "0xB7249313d22590f7d336Fb256cae48eB96bb1547": 0.195311881154913269,
    "0x2DA892095B107381C2D68B70Cd6EF045bC16815d": 1.753921607388037262,
    "0x406149cb165Db1a0c1C8AA8d9310C4F36a7d6864": 0.829205908157412463,
    "0x056906BDB6A508bf4209B48D2542aE6952a5f5AA": 0.235285828767334254,
    "0x9a1654a15ccd68D04b353C7EA8d5791A9316c2F6": 0.162389866630350571,
    "0x1E55Aae913d4De20A1Ec5e07D83C87dB6b0349c7": 2.015770347759462177, 
    "0x917Be8168E62621eD9607283561FA1f7FD4e81e6": 1.677936764438205719,
    "0xAC82362174A32fBBAd61Efcb0f02b9016B20C768": 0.353736616611616427,
    "0xB4F17C28B4FeE29231c37Aa4B4Fc4b42a02D6673": 0.150372841292881892,
    "0x3CE316D3B3d9A20F3e48e9da4d95892773e29F8e": 0.80640073902898246,
    "0x22b908c2FeA7a1e6043FfcDBc77D660D4D326961": 2.52026947202091911,
    "0xcc5B087283D69dB4237Da489d487140f2745fD28": 1.209601108543473913,
    "0x67beb3Dd509b88b706dC5A9f03f50006410b088B": 0.431375773047898203, 
    "0xED3981C6220dFcd368268b180b87AB643ce04b75": 239.86558804423955848,
}).map((e) => [e[0].toLowerCase(), e[1]]));

// console.log(`Found ${Object.values(claims).length} claims`);
// const totalClaimed = Object.values(claims).reduce((t,c) => t += c, 0);
// console.log(`Claimed ${totalClaimed} BERA`);
// console.log(43988.291381501009248025 + totalClaimed);

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
    }> = {};

    for (const key of Object.keys(positionsByMarket)) {
        const marketId = key.slice(4);
        const tokens = positionsByMarket[key].inputTokenAmount;
        const usdValue = positionsByMarket[key].inputTokenAmountUSD;
        const marketData = marketLookup[marketId];
        if (!marketData) {
            console.log('No market data for', marketId);
            continue;
        }
        let duration = marketData.lockup_time ? Number(marketData.lockup_time) / (60 * 60 * 24) : 90;
        if (!marketData.lockup_time) {
            console.log(marketId);
        }
        let multiplier = overrideMarketMap.find((e) => e.id === marketId)?.multiplier;
        if (!multiplier) {
            multiplier = 1;
            console.log('found missing multiplier for ', marketId);
        }
        const points = multiplier * duration * usdValue;
        
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
            multiplier,
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

    // console.log({
    //     totalTvl: totalTvl.toLocaleString(),
    //     totalPoints: totalPoints.toLocaleString(),
    //     bucketOneTvl: bucketOneTvl.toLocaleString(),
    //     bucketOnePoints: bucketOnePoints.toLocaleString(),
    //     bucketTwoTvl: bucketTwoTvl.toLocaleString(),
    //     bucketTwoPoints: bucketTwoPoints.toLocaleString(),
    //     marketAllocations,
    //     emitted: Object.values(marketAllocations).reduce((t, m) => t + m.amount, 0),
    // });

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
    const thirtyDayAccountEntitlements: AccountEntitlement = {};
    const ninetyDayAccountEntitlements: AccountEntitlement = {};
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
    }

    for (const [key, value] of Object.entries(thirtyDayAccountEntitlements)) {
        const amount = Object.values(value).reduce((t, c) => t += c, 0);
        const claimed = claims[key];

        console.log({
            key,
            amount,
            claimed,
        })

        if (claimed > amount) {
            leakedBera += claimed - amount;
        } else if (claimed > 0) {
            deficientBera += amount - claimed;
        }
    }

    console.log({
        leakedBera,
        deficientBera,
    });

    writeFileSync('user-allocations-ninety-day.json', JSON.stringify(ninetyDayAccountEntitlements, undefined, 2));
    writeFileSync('user-allocations-thirty-day.json', JSON.stringify(thirtyDayAccountEntitlements, undefined, 2));
    console.table(thirtyDayMarkets.map((s) => ({ ...s, usdValue: s.usdValue.toLocaleString(), tokens: s.tokens.toLocaleString() })));
    const thirtyDayTvl = thirtyDayMarkets.reduce((total, c) => total += c.usdValue, 0);
    console.log(`Total TVL: ${thirtyDayTvl.toLocaleString()}`)
    console.log(`Distributed ${((tokensForThirtyDay / 10_000_000) * 100).toFixed(3)}% of Boyco`);
    console.log(`Distributed ${tokensForThirtyDay.toLocaleString()} BERA`);
    console.log(`Total Claimants: ${Object.keys(thirtyDayAccountEntitlements).length}`);
    console.log('');
    console.table(ninetyDayMarkets.map((s) => ({ ...s, usdValue: s.usdValue.toLocaleString(), tokens: s.tokens.toLocaleString() })));
    const ninetyDayTvl = ninetyDayMarkets.reduce((total, c) => total += c.usdValue, 0);
    console.log(`Total TVL: ${ninetyDayTvl.toLocaleString()}`)
    console.log(`Total Claimants: ${Object.keys(ninetyDayAccountEntitlements).length}`);
    console.log(`Distributed ${((tokensForNinetyDay / 10_000_000) * 100).toFixed(3)}% of Boyco`);
    console.log(`Distributed ${tokensForNinetyDay.toLocaleString()} BERA`);
}

processData()
