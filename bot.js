const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const NFTMonitor = require('./nft-monitor');
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
const NFT_ALERT_CHANNEL_ID = process.env.NFT_ALERT_CHANNEL_ID || null;

// Initialize NFT Monitor
const nftMonitor = new NFTMonitor();

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
        
        for (const pair of pairs) {
            try {
                const response = await axios.get(`https://api.dexscreener.com/latest/dex/pairs/cronos/${pair.address}`);
                
                if (response.data.pair) {
                    const pairInfo = response.data.pair;
                    const liquidity = parseFloat(pairInfo.liquidity?.usd || 0);
                    const volume = parseFloat(pairInfo.volume?.h24 || 0);
                    
                    totalLiquidity += liquidity;
                    totalVolume += volume;
                    
                    pairData.push({
                        name: pair.name,
                        liquidity: liquidity,
                        volume: volume,
                        price: parseFloat(pairInfo.priceUsd || 0),
                        dex: pairInfo.dexId?.toUpperCase() || 'Unknown'
                    });
                }
            } catch (error) {
                console.log(`Error fetching ${pair.name}:`, error.message);
            }
        }
        
        // Fetch market cap from specific URL
        try {
            const marketCapResponse = await axios.get('https://api.dexscreener.com/latest/dex/pairs/cronos/0xb377df33f200b92a4deec6ee6b40ed0b4b4a7293');
            if (marketCapResponse.data.pair) {
                marketCap = parseFloat(marketCapResponse.data.pair.marketCap || 0);
            }
        } catch (error) {
            console.log('Error fetching market cap:', error.message);
        }
        
        if (pairData.length > 0) {
            return {
                pairs: pairData,
                totalLiquidity: totalLiquidity,
                totalVolume: totalVolume,
                averagePrice: pairData.reduce((sum, p) => sum + p.price, 0) / pairData.length,
                marketCap: marketCap
            };
        }
        
        return null;
    } catch (error) {
        console.error('Error fetching token data:', error.message);
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
            { name: 'Average Price (USD)', value: `$${tokenData.averagePrice.toFixed(8)}`, inline: true }
        );
    }

    // Add total 24h volume
    if (tokenData.totalVolume) {
        embed.addFields(
            { name: 'Total 24h Volume', value: `$${tokenData.totalVolume.toLocaleString()}`, inline: true }
        );
    }

    // Add individual liquidity for each pair
    let liquidityText = '';
    for (const pair of tokenData.pairs) {
        const quoteToken = pair.name.split('/')[1];
        liquidityText += `**${quoteToken}**: $${pair.liquidity.toLocaleString()} (${pair.dex})\n`;
    }
    
    embed.addFields(
        { name: 'Individual Liquidity', value: liquidityText, inline: false }
    );

    // Add total liquidity
    if (tokenData.totalLiquidity) {
        embed.addFields(
            { name: 'Total Liquidity', value: `$${tokenData.totalLiquidity.toLocaleString()}`, inline: true }
        );
    }

    // Add market cap from API
    if (tokenData.marketCap) {
        embed.addFields(
            { name: 'Market Cap', value: `$${tokenData.marketCap.toLocaleString()}`, inline: true }
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
    
    // Initialize NFT Monitor if alert channel is configured
    if (NFT_ALERT_CHANNEL_ID) {
        const initialized = await nftMonitor.initialize(client, NFT_ALERT_CHANNEL_ID);
        if (initialized) {
            nftMonitor.startMonitoring();
            console.log('NFT monitoring started');
        }
    } else {
        console.log('NFT monitoring disabled (no alert channel configured)');
    }
});

// Message event handler
client.on('messageCreate', async (message) => {
    // Ignore messages from bots
    if (message.author.bot) return;

    const messageContent = message.content.toLowerCase();

    // Check for NFT commands
    if (messageContent.includes('nft rates') || messageContent.includes('nft price')) {
        await handleNFTRatesCommand(message);
        return;
    }

    if (messageContent.includes('nft status') || messageContent.includes('nft monitor')) {
        await handleNFTStatusCommand(message);
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

// NFT command handlers
async function handleNFTRatesCommand(message) {
    try {
        await message.channel.sendTyping();
        
        const rates = await nftMonitor.getNFTRates();
        
        if (Object.keys(rates).length > 0) {
            const embed = new EmbedBuilder()
                .setTitle('NFT Exchange Rates')
                .setColor(0x00AE86)
                .setDescription('Current NFT to CAWCAW exchange rates')
                .setTimestamp();
            
            for (const [symbol, rate] of Object.entries(rates)) {
                embed.addFields(
                    { name: symbol, value: `${rate} CAWCAW`, inline: true }
                );
            }
            
            embed.setFooter({ text: 'CAWCAW Marketplace Rates' });
            await message.reply({ embeds: [embed] });
        } else {
            const errorEmbed = new EmbedBuilder()
                .setTitle('NFT Rates Unavailable')
                .setDescription('Unable to fetch NFT rates at this time.')
                .setColor(0xFF0000)
                .setTimestamp();
            
            await message.reply({ embeds: [errorEmbed] });
        }
    } catch (error) {
        console.error('Error handling NFT rates command:', error);
        const errorEmbed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('Failed to fetch NFT rates.')
            .setColor(0xFF0000)
            .setTimestamp();
        
        await message.reply({ embeds: [errorEmbed] });
    }
}

async function handleNFTStatusCommand(message) {
    try {
        const embed = new EmbedBuilder()
            .setTitle('NFT Monitor Status')
            .setColor(0x00AE86)
            .addFields(
                { name: 'Monitor Status', value: nftMonitor.isMonitoring ? 'Active' : 'Inactive', inline: true },
                { name: 'Alert Channel', value: NFT_ALERT_CHANNEL_ID ? 'Configured' : 'Not Configured', inline: true },
                { name: 'Supported Collections', value: '4 Collections', inline: true }
            )
            .setDescription('Monitoring CAWCAW Marketplace for NFT activity')
            .setTimestamp()
            .setFooter({ text: 'CAWCAW NFT Monitor' });
        
        await message.reply({ embeds: [embed] });
    } catch (error) {
        console.error('Error handling NFT status command:', error);
        const errorEmbed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription('Failed to get NFT monitor status.')
            .setColor(0xFF0000)
            .setTimestamp();
        
        await message.reply({ embeds: [errorEmbed] });
    }
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
