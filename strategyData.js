/**
 * strategyData.js
 *
 * Fetches live arbitrage opportunity data matching the CAWCAW strategy page.
 *
 * DATA SOURCES (all public, zero API keys needed):
 *   1. DexScreener            — CAWCAW/USD price and CRO/USD price
 *   2. api.ebisusbay.com      — floor price (CRO) + cheapest listing per collection
 *   3. CAWCAW contract        — vault token rates per collection (with hardcoded fallback)
 *
 * ARBITRAGE TYPES CALCULATED:
 *   🔄 Floor Flip  — Buy NFT from CAWCAW vault → list on Ebisu at floor price
 *   🏦 Vault Pump  — Buy cheapest Ebisu listing → sell to CAWCAW vault
 *
 * NOTE: Profit estimates exclude gas, platform fees, and slippage (same as the website).
 */

const axios = require('axios');
const { ethers } = require('ethers');

// ─── Config ───────────────────────────────────────────────────────────────────

const EBISU_API       = 'https://api.ebisusbay.com';
const CAWCAW_CONTRACT = '0x777cccA4e5dCCA8c85978a94bD65aA83ccBE8395';
const CRONOS_RPC      = process.env.CRONOS_RPC_URL || 'https://cronos-evm.publicnode.com';

// DexScreener pair addresses on Cronos
const CAWCAW_USDC_PAIR = '0xb377DF33f200b92A4dEec6eE6B40ed0b4b4A7293';
const CRO_USDC_PAIR    = '0xa68466208f1a3eb21650320d2520ee8eba5ba623'; // WCRO/USDC on VVS

const COLLECTIONS = [
    { name: 'CRO CROW',      nftPrefix: 'CRO CROW',   contract: '0xE4ab77ED89528d90E6bcf0E1Ac99C58Da24e79d5', vaultTokens: 400  },
    { name: 'CRO CROW NEST', nftPrefix: 'CRO CROW NEST', contract: '0x937879726455531dB135F9b8D88F38dF5D4Eb13b', vaultTokens: 1700 },
    { name: 'MAD CROW',      nftPrefix: 'MAD CROW',   contract: '0x65AB0251d29c9C473c8d01BFfa2966F891fB1181', vaultTokens: 400  },
    { name: '3D CROW',       nftPrefix: '3D CROW',    contract: '0x3d7777ff1908B54b57038A2556d6904f71468e2D', vaultTokens: 130  },
    { name: 'CROW PUNK',     nftPrefix: 'CROWPUNK',   contract: '0x0f1439A290E86a38157831Fe27a3dCD302904055', vaultTokens: 288  },
];

const VAULT_ABI = [
    'function getCollectionTokens(address collection) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
];

// ─── Cache ────────────────────────────────────────────────────────────────────

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function get(url) {
    const res = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'CAWCAW-DiscordBot/2.0' },
    });
    return res.data;
}

// ─── Individual fetchers ──────────────────────────────────────────────────────

async function fetchPrices() {
    const [cawData, croData] = await Promise.all([
        get(`https://api.dexscreener.com/latest/dex/pairs/cronos/${CAWCAW_USDC_PAIR}`),
        get(`https://api.dexscreener.com/latest/dex/pairs/cronos/${CRO_USDC_PAIR}`),
    ]);
    return {
        cawcawUsd: parseFloat(cawData?.pair?.priceUsd || 0),
        croUsd:    parseFloat(croData?.pair?.priceUsd  || croData?.pair?.priceNative || 0),
    };
}

async function fetchCollectionFloor(contract) {
    try {
        const data = await get(`${EBISU_API}/collections?collection=${contract}&pageSize=1`);
        const col = data?.collections?.[0] || data?.[0];
        return parseFloat(col?.floorPrice || col?.stats?.floor || 0);
    } catch {
        return 0;
    }
}

/**
 * Fetch the number of NFTs held by the CAWCAW vault for a collection.
 * Uses blockchain balance check since Ebisu's Bay API doesn't provide owner endpoint.
 */
async function fetchVaultNftCount(contract) {
    try {
        const provider = new ethers.JsonRpcProvider(CRONOS_RPC);
        const nftContract = new ethers.Contract(contract, [
            "function balanceOf(address owner) external view returns (uint256)"
        ], provider);
        
        const balance = await nftContract.balanceOf(CAWCAW_CONTRACT);
        return Number(balance);
    } catch {
        return 0;
    }
}

async function fetchCheapestListing(contract, collectionName, nftPrefix) {
    try {
        const data = await get(
            `${EBISU_API}/listings?collection=${contract}&state=0&sortBy=price&direction=asc&pageSize=1`
        );
        const listing = data?.listings?.[0] || data?.[0];
        if (!listing) return null;
        const tokenId = listing.tokenId || listing.nftId;
        return {
            tokenId,
            priceCro: parseFloat(listing.price || 0),
            rank:     listing.rank || listing.rarityRank || null,
            nftName:  `${nftPrefix} #${tokenId}`,
        };
    } catch {
        return null;
    }
}

async function fetchVaultRates() {
    // Seed with hardcoded values first — these are the fallback
    const rates = new Map(COLLECTIONS.map(c => [c.contract.toLowerCase(), c.vaultTokens]));

    try {
        const provider = new ethers.JsonRpcProvider(CRONOS_RPC);
        const vault    = new ethers.Contract(CAWCAW_CONTRACT, VAULT_ABI, provider);
        const decimals = Number(await vault.decimals());

        await Promise.allSettled(
            COLLECTIONS.map(async c => {
                const raw    = await vault.getCollectionTokens(c.contract);
                const tokens = parseFloat(ethers.formatUnits(raw, decimals));
                if (tokens > 0) rates.set(c.contract.toLowerCase(), tokens);
            })
        );
    } catch (err) {
        console.warn('[strategyData] Vault RPC failed, using hardcoded rates:', err.message);
    }

    return rates;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Returns live strategy data:
 * {
 *   prices: { cawcawUsd, croUsd },
 *   opportunities: OpportunityObject[],
 *   lastUpdated: Date
 * }
 *
 * OpportunityObject: {
 *   type: 'floor_flip' | 'vault_pump',
 *   collection: string,
 *   profitable: boolean,
 *   profitUsd: number,
 *   step1: { label, detail, costUsd, croAmount?, cawcawAmount?, tokenId?, rank?, nftName? },
 *   step2: { label, detail, revenueUsd, croAmount?, cawcawAmount? },
 * }
 */
async function getStrategyData() {
    if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
        return _cache;
    }

    // Fetch everything in parallel
    const [prices, vaultRates, ...ebisuResults] = await Promise.all([
        fetchPrices(),
        fetchVaultRates(),
        ...COLLECTIONS.flatMap(col => [
            fetchCollectionFloor(col.contract),
            fetchCheapestListing(col.contract, col.name, col.nftPrefix),
            fetchVaultNftCount(col.contract),
        ]),
    ]);

    const { cawcawUsd, croUsd } = prices;
    const opportunities = [];

    COLLECTIONS.forEach((col, i) => {
        const floorCro    = ebisuResults[i * 3]     || 0;
        const cheapest    = ebisuResults[i * 3 + 1] || null;
        const vaultCount  = ebisuResults[i * 3 + 2] || 0;
        const vaultTokens = vaultRates.get(col.contract.toLowerCase()) || col.vaultTokens;

        const floorUsd    = floorCro    * croUsd;
        const vaultUsd    = vaultTokens * cawcawUsd;

        // ── Floor Flip ───────────────────────────────────────────────────────
        // Pay vaultUsd in CAWCAW → receive floorUsd in CRO
        if (floorCro > 0 && vaultCount > 0) {
            const profitUsd = floorUsd - vaultUsd;
            opportunities.push({
                type:       'floor_flip',
                collection: col.name,
                profitable: profitUsd > 0,
                profitUsd,
                step1: {
                    label:        'Buy from CAWCAW Vault',
                    cawcawAmount: vaultTokens,
                    costUsd:      vaultUsd,
                },
                step2: {
                    label:      'List on Ebisus at floor',
                    croAmount:  floorCro,
                    revenueUsd: floorUsd,
                },
            });
        }

        // ── Vault Pump ───────────────────────────────────────────────────────
        // Pay cheapest listing CRO → receive vaultUsd in CAWCAW
        if (cheapest && cheapest.priceCro > 0) {
            const buyCostUsd = cheapest.priceCro * croUsd;
            const profitUsd  = vaultUsd - buyCostUsd;
            opportunities.push({
                type:       'vault_pump',
                collection: col.name,
                profitable: profitUsd > 0,
                profitUsd,
                step1: {
                    label:     'Buy from Ebisus Bay',
                    croAmount: cheapest.priceCro,
                    costUsd:   buyCostUsd,
                    tokenId:   cheapest.tokenId,
                    rank:      cheapest.rank,
                    nftName:   cheapest.nftName,
                },
                step2: {
                    label:        'Sell to CAWCAW Vault',
                    cawcawAmount: vaultTokens,
                    revenueUsd:   vaultUsd,
                },
            });
        }
    });

    // Sort: profitable first, then by absolute profit descending
    opportunities.sort((a, b) => {
        if (a.profitable !== b.profitable) return a.profitable ? -1 : 1;
        return Math.abs(b.profitUsd) - Math.abs(a.profitUsd);
    });

    const result = { prices, opportunities, lastUpdated: new Date() };
    _cache     = result;
    _cacheTime = Date.now();

    console.log(`[strategyData] Fetched ${opportunities.length} opportunities. CAWCAW=$${cawcawUsd} CRO=$${croUsd}`);
    return result;
}

module.exports = { getStrategyData };
