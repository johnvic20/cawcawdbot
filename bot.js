const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const { ethers } = require('ethers');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || '0x777cccA4e5dCCA8c85978a94bD65aA83ccBE8395';
const TOKEN_NAME = process.env.TOKEN_NAME || 'CAWCAW';
const CONTRACT_ALERT_CHANNEL_ID = process.env.CONTRACT_ALERT_CHANNEL_ID || null;

// Web3 setup for Cronos mainnet
const CRONOS_RPC_URL = process.env.CRONOS_RPC_URL || 'https://cronos-evm.publicnode.com';
const provider = new ethers.JsonRpcProvider(CRONOS_RPC_URL);

// Contract ABI (minimal for events we need)
const CONTRACT_ABI = [
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "function buyCAWCAW(address[] calldata collections, uint256[] calldata tokenIds) external",
    "function sellCAWCAW(address[] calldata collections, uint256[] calldata tokenIds) external",
    "function totalSupply() external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)"
];

// NFT Collections to monitor
const NFT_COLLECTIONS = {
    'CRO CROW': '0xE4ab77ED89528d90E6bcf0E1Ac99C58Da24e79d5',
    'CRO CROW NEST': '0x937879726455531dB135F9b8D88F38dF5D4Eb13b',
    'MAD CROW': '0x65AB0251d29c9C473c8d01BFfa2966F891fB1181',
    '3D CROW': '0x3d7777ff1908B54b57038A2556d6904f71468e2D',
    'CROW PUNK': '0x0f1439A290E86a38157831Fe27a3dCD302904055'
};

// Contract instance
const contract = new ethers.Contract(TOKEN_ADDRESS, CONTRACT_ABI, provider);

// Store last processed block to avoid duplicate events
let lastProcessedBlock = 0;

// Get collection name from address
function getCollectionName(address) {
    for (const [name, addr] of Object.entries(NFT_COLLECTIONS)) {
        if (addr.toLowerCase() === address.toLowerCase()) {
            return name;
        }
    }
    return 'Unknown Collection';
}

// Create NFT activity alert embed
function createNFTAlertEmbed(type, collectionName, tokenId, from, to, txHash) {
    const isDeposit = to.toLowerCase() === TOKEN_ADDRESS.toLowerCase();
    const isWithdrawal = from.toLowerCase() === TOKEN_ADDRESS.toLowerCase();
    
    let title, color, description;
    
    if (isDeposit) {
        title = '🏦 NFT Deposited to Contract';
        color = 0x00FF00; // Green
        description = `Someone deposited a **${collectionName}** NFT to the CAWCAW contract!`;
    } else if (isWithdrawal) {
        title = '💸 NFT Withdrawn from Contract';
        color = 0xFF9900; // Orange
        description = `Someone withdrew a **${collectionName}** NFT from the CAWCAW contract!`;
    } else {
        title = '🔄 NFT Transfer';
        color = 0x0099FF; // Blue
        description = `**${collectionName}** NFT transferred`;
    }
    
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .addFields(
            { name: '🎨 Collection', value: collectionName, inline: true },
            { name: '🆔 Token ID', value: `#${tokenId}`, inline: true },
            { name: '📤 From', value: `\`${from.slice(0, 6)}...${from.slice(-4)}\``, inline: true },
            { name: '📥 To', value: `\`${to.slice(0, 6)}...${to.slice(-4)}\``, inline: true }
        )
        .addFields(
            { name: '🔗 Transaction', value: `[View on Explorer](https://cronoscan.com/tx/${txHash})`, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: 'CAWCAW Contract Monitor' });
    
    return embed;
}

// Monitor NFT transfers to/from contract
async function monitorNFTTransfers() {
    try {
        const currentBlock = await provider.getBlockNumber();
        
        // Initialize on first run
        if (lastProcessedBlock === 0) {
            lastProcessedBlock = currentBlock;
            console.log(`NFT Monitor: Starting from block ${currentBlock}`);
            return;
        }
        
        // Check recent blocks (scan last 5 blocks to catch any missed events)
        const fromBlock = Math.max(0, lastProcessedBlock - 4);
        const toBlock = currentBlock;
        
        console.log(`NFT Monitor: Scanning blocks ${fromBlock} to ${toBlock}`);
        
        // Monitor each collection
        for (const [collectionName, collectionAddress] of Object.entries(NFT_COLLECTIONS)) {
            try {
                // Create NFT contract instance
                const nftContract = new ethers.Contract(collectionAddress, [
                    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
                ], provider);
                
                // Get Transfer events
                const filter = nftContract.filters.Transfer();
                const events = await nftContract.queryFilter(filter, fromBlock, toBlock);
                
                for (const event of events) {
                    const { from, to, tokenId } = event.args;
                    const txHash = event.transactionHash;
                    const blockNumber = event.blockNumber;
                    
                    // Only process new events
                    if (blockNumber > lastProcessedBlock) {
                        // Check if transfer involves our contract
                        if (from.toLowerCase() === TOKEN_ADDRESS.toLowerCase() || 
                            to.toLowerCase() === TOKEN_ADDRESS.toLowerCase()) {
                            
                            console.log(`NFT Activity: ${collectionName} #${tokenId} from ${from} to ${to}`);
                            
                            // Send alert to Discord channel
                            await sendNFTAlert(collectionName, tokenId.toString(), from, to, txHash);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error monitoring ${collectionName}:`, error.message);
            }
        }
        
        lastProcessedBlock = currentBlock;
    } catch (error) {
        console.error('Error in NFT monitoring:', error);
    }
}

// Send NFT alert to Discord
async function sendNFTAlert(collectionName, tokenId, from, to, txHash) {
    if (!CONTRACT_ALERT_CHANNEL_ID) {
        console.log('No alert channel configured, skipping NFT alert');
        return;
    }
    
    try {
        const channel = await client.channels.fetch(CONTRACT_ALERT_CHANNEL_ID);
        if (!channel) {
            console.log('Alert channel not found');
            return;
        }
        
        const embed = createNFTAlertEmbed('transfer', collectionName, tokenId, from, to, txHash);
        await channel.send({ embeds: [embed] });
        console.log(`NFT Alert sent: ${collectionName} #${tokenId}`);
    } catch (error) {
        console.error('Error sending NFT alert:', error);
    }
}

// Helper function for API calls with retry logic
async function fetchWithRetry(url, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await axios.get(url, {
                timeout: 10000, // 10 second timeout
                headers: {
                    'User-Agent': 'CAWCAW-Bot/1.0'
                }
            });
            return response;
        } catch (error) {
            console.log(`Attempt ${attempt}/${maxRetries} failed for ${url}: ${error.message}`);
            
            if (attempt === maxRetries) {
                throw error;
            }
            
            // Exponential backoff
            const backoffDelay = delay * Math.pow(2, attempt - 1);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
    }
}

// Fetch token data from DexScreener API for three specific pairs
async function fetchTokenData() {
    const pairs = [
        { name: 'CAWCAW/USDC', address: '0xb377DF33f200b92A4dEec6eE6B40ed0b4b4A7293' },
        { name: 'CAWCAW/CAW', address: '0x43b81c799e51001e6F16C51756dd81868C99d343' },
        { name: 'CAWCAW/CRO', address: '0xB5dDf0bBC445B93CFAe7eE503c2Fd6FDB6a3B4c9' }
    ];
    
    try {
        const pairData = [];
        let totalLiquidity = 0;
        let totalVolume = 0;
        let marketCap = 0;
        let successfulPairs = 0;
        
        // Fetch data for each pair with delay to avoid rate limits
        for (let i = 0; i < pairs.length; i++) {
            const pair = pairs[i];
            
            try {
                console.log(`Fetching data for ${pair.name}...`);
                const response = await fetchWithRetry(`https://api.dexscreener.com/latest/dex/pairs/cronos/${pair.address}`);
                
                if (response.data && response.data.pair) {
                    const pairInfo = response.data.pair;
                    const liquidity = parseFloat(pairInfo.liquidity?.usd || 0);
                    const volume = parseFloat(pairInfo.volume?.h24 || 0);
                    const price = parseFloat(pairInfo.priceUsd || 0);
                    
                    totalLiquidity += liquidity;
                    totalVolume += volume;
                    successfulPairs++;
                    
                    pairData.push({
                        name: pair.name,
                        liquidity: liquidity,
                        volume: volume,
                        price: price,
                        dex: pairInfo.dexId?.toUpperCase() || 'Unknown'
                    });
                    
                    console.log(`✓ Successfully fetched ${pair.name}: $${price.toFixed(8)}`);
                } else {
                    console.log(`✗ No data available for ${pair.name}`);
                }
            } catch (error) {
                console.log(`✗ Failed to fetch ${pair.name} after 3 attempts: ${error.message}`);
                
                // Check if it's a rate limit error
                if (error.response?.status === 429) {
                    console.log('Rate limit detected, waiting longer before next request...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }
            
            // Add delay between requests to avoid rate limits
            if (i < pairs.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        // Fetch market cap from specific URL
        try {
            console.log('Fetching market cap data...');
            const marketCapResponse = await fetchWithRetry('https://api.dexscreener.com/latest/dex/pairs/cronos/0xb377df33f200b92a4deec6ee6b40ed0b4b4a7293');
            if (marketCapResponse.data && marketCapResponse.data.pair) {
                marketCap = parseFloat(marketCapResponse.data.pair.marketCap || 0);
                console.log(`✓ Market cap: $${marketCap.toLocaleString()}`);
            }
        } catch (error) {
            console.log(`✗ Failed to fetch market cap: ${error.message}`);
        }
        
        if (successfulPairs > 0) {
            console.log(`✓ Successfully fetched data for ${successfulPairs}/${pairs.length} pairs`);
            return {
                pairs: pairData,
                totalLiquidity: totalLiquidity,
                totalVolume: totalVolume,
                averagePrice: pairData.reduce((sum, p) => sum + p.price, 0) / pairData.length,
                marketCap: marketCap
            };
        } else {
            console.log('✗ No pair data was successfully fetched');
            return null;
        }
    } catch (error) {
        console.error('Critical error in fetchTokenData:', error.message);
        return null;
    }
}

// Create embed message for token information
function createTokenEmbed(tokenData) {
    const embed = new EmbedBuilder()
        .setTitle(`${TOKEN_NAME} Token Information`)
        .setColor(0x00AE86)
        .setTimestamp();

    // Add average price
    if (tokenData.averagePrice) {
        embed.addFields(
            { name: '💰 Current Price', value: `$${tokenData.averagePrice.toFixed(8)}`, inline: true }
        );
    }

    // Add total 24h volume
    if (tokenData.totalVolume) {
        embed.addFields(
            { name: '📊 24h Volume', value: `$${tokenData.totalVolume.toLocaleString()}`, inline: true }
        );
    }

    // Add individual liquidity for each pair
    let liquidityText = '';
    for (const pair of tokenData.pairs) {
        const quoteToken = pair.name.split('/')[1];
        let dexName = pair.dex === 'EBISUS-BAY' ? 'EBISUSBAY' : pair.dex === 'VVSFINANCE' ? 'VVS' : pair.dex;
        liquidityText += `**${quoteToken}**: $${pair.liquidity.toLocaleString()} (${dexName})\n`;
    }
    
    embed.addFields(
        { name: '💧 Liquidity', value: liquidityText, inline: false }
    );

    // Add total liquidity
    if (tokenData.totalLiquidity) {
        embed.addFields(
            { name: '💧 Total Liquidity', value: `$${tokenData.totalLiquidity.toLocaleString()}`, inline: true }
        );
    }

    // Add market cap from API
    if (tokenData.marketCap) {
        embed.addFields(
            { name: '🏛️ Market Cap', value: `$${tokenData.marketCap.toLocaleString()}`, inline: true }
        );
    }

    // Add Links section
    embed.addFields(
        { name: 'Links', value: '[DexScreener](https://dexscreener.com/cronos/0xb377df33f200b92a4deec6ee6b40ed0b4b4a7293)', inline: false }
    );

    embed.setFooter({ text: 'Data provided by DexScreener' });

    return embed;
}

// Bot ready event
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    
    // Start NFT monitoring
    console.log('Starting NFT monitoring...');
    
    // Initial scan
    await monitorNFTTransfers();
    
    // Set up interval for monitoring (every 15 seconds)
    setInterval(async () => {
        await monitorNFTTransfers();
    }, 15000);
    
    console.log('NFT monitoring started - checking every 15 seconds');
});

// Message event handler
client.on('messageCreate', async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;

    const messageContent = message.content.toLowerCase();


    // Check for destruction command
    if (messageContent.includes('destruction') || messageContent === 'd' || messageContent === 'd ' || messageContent === 'D' || messageContent === 'D ' || messageContent.includes('destroy')) {
        await handleDestructionCommand(message);
        return;
    }

    // Check for circulating supply command
    if (messageContent.includes('circulating') || messageContent === 'c' || messageContent === 'c ' || messageContent === 'C' || messageContent === 'C ') {
        await handleCirculatingCommand(message);
        return;
    }

    // Check if message contains "cawcaw" (case insensitive)
    if (messageContent.includes('cawcaw')) {
        try {
            // Show typing indicator
            await message.channel.sendTyping();

            // Fetch token data
            const tokenData = await fetchTokenData();

            if (tokenData) {
                const embed = createTokenEmbed(tokenData);
                await message.reply({ embeds: [embed] });
            } else {
                const errorEmbed = new EmbedBuilder()
                    .setTitle('Error Fetching Token Data')
                    .setDescription('Unable to fetch token information from DexScreener. Please try again later.')
                    .setColor(0xFF0000)
                    .setTimestamp();
                
                await message.reply({ embeds: [errorEmbed] });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setTitle('Bot Error')
                .setDescription('An error occurred while processing your request.')
                .setColor(0xFF0000)
                .setTimestamp();
            
            await message.reply({ embeds: [errorEmbed] });
        }
    }
});


// Handle destruction command
async function handleDestructionCommand(message) {
    try {
        await message.channel.sendTyping();
        
        const embed = new EmbedBuilder()
            .setTitle('Destruction')
            .setColor(0xFF0000)
            //.setDescription('The balcony destruction scene from Bleach - a moment of pure destruction!')
            .setImage('https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExcWJ6ZmpnanFiaGo4aHZidWV0cmZpYmh1bnQzM2t0b2JnY2M5NDlldSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/chiOoeDwYDl9S/giphy.gif')
            //.setTimestamp()
            //.setFooter({ text: 'CAWCAW Bot' });
        
        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error handling destruction command:', error);
        const errorEmbed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('Failed to load destruction GIF.')
            .setColor(0xFF0000)
            .setTimestamp();
        
        await message.reply({ embeds: [errorEmbed] });
    }
}


// Helper function to create a visual supply distribution bar
function createSupplyBar(circulationRate, contractHoldRate) {
    const totalBars = 20;
    const circulationBars = Math.round((circulationRate / 100) * totalBars);
    const contractBars = totalBars - circulationBars;
    
    const circulationPart = '🟦'.repeat(circulationBars);
    const contractPart = '🟥'.repeat(contractBars);
    
    return `${circulationPart}${contractPart}\n🟦 Circulating | 🟥 Contract`;
}

// Handle circulating supply command
async function handleCirculatingCommand(message) {
    try {
        await message.channel.sendTyping();
        
        // Get token decimals for proper formatting
        const decimals = await contract.decimals();
        
        // Get total supply
        const totalSupply = await contract.totalSupply();
        
        // Get contract balance (tokens held by the contract itself)
        const contractBalance = await contract.balanceOf(TOKEN_ADDRESS);
        
        // Calculate circulating supply (total supply - contract balance)
        const circulatingSupply = totalSupply - contractBalance;
        
        // Format numbers with proper decimals
        const formatTokens = (amount) => {
            // Convert BigInt to string immediately to avoid any BigInt operations
            const amountStr = amount.toString();
            const decimalsNum = Number(decimals);
            
            // Convert BigInt to string using ethers.formatUnits
            const formattedStr = ethers.formatUnits(amountStr, decimalsNum).toString();
            
            // Manual formatting without number conversion
            const parts = formattedStr.split('.');
            let integerPart = parts[0];
            let decimalPart = parts[1] || '';
            
            // Add commas to integer part
            integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            
            // Handle decimal places using string length comparison
            const decimalsStr = decimalsNum.toString();
            if (decimalPart.length > decimalsNum) {
                decimalPart = decimalPart.substring(0, decimalsNum);
            } else if (decimalPart.length < decimalsNum) {
                // Manual padding instead of padEnd
                while (decimalPart.length < decimalsNum) {
                    decimalPart += '0';
                }
            }
            
            // Remove trailing zeros from decimal part if not needed
            if (decimalPart === '0000000' || decimalPart === '') {
                return integerPart;
            } else {
                // Remove trailing zeros but keep at least one decimal if needed
                decimalPart = decimalPart.replace(/0+$/, '');
                if (decimalPart) {
                    return integerPart + '.' + decimalPart;
                } else {
                    return integerPart;
                }
            }
        };
        
        const circulationRate = (Number(circulatingSupply) / Number(totalSupply)) * 100;
        const contractHoldRate = (Number(contractBalance) / Number(totalSupply)) * 100;
        
        const embed = new EmbedBuilder()
            .setTitle(`${TOKEN_NAME} Token Supply`)
            .setColor(0x00AE86)
            .addFields(
                { 
                    name: '💰 **Total Supply**', 
                    value: `**${formatTokens(totalSupply)}** ${TOKEN_NAME}`, 
                    inline: false 
                },
                { 
                    name: '🏦 **Contract Holdings**', 
                    value: `**${formatTokens(contractBalance)}** ${TOKEN_NAME}`, 
                    inline: false 
                },
                { 
                    name: '🌍 **Circulating Supply**', 
                    value: `**${formatTokens(circulatingSupply)}** ${TOKEN_NAME}`, 
                    inline: false 
                }
            )
            .addFields(
                { 
                    name: 'Circulation', 
                    value: `${circulationRate.toFixed(2)}%`, 
                    inline: true 
                },
                { 
                    name: 'Contract Hold', 
                    value: `${contractHoldRate.toFixed(2)}%`, 
                    inline: true 
                }
            )
            .addFields(
                {
                    name: '📊 **Supply Distribution**',
                    value: createSupplyBar(circulationRate, contractHoldRate),
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({ text: 'CAWCAW Bot - Supply Information' });
        
        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error handling circulating command:', error);
        const errorEmbed = new EmbedBuilder()
            .setTitle('Error Fetching Supply Data')
            .setDescription('Unable to fetch token supply information. Please try again later.')
            .setColor(0xFF0000)
            .setTimestamp();
        
        await message.reply({ embeds: [errorEmbed] });
    }
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
