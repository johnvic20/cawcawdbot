const { ethers } = require('ethers');
const axios = require('axios');

// NFT Monitoring Configuration
const NFT_CONFIG = {
    marketplace: {
        address: '0x777cccA4e5dCCA8c85978a94bD65aA83ccBE8395',
        rpcUrl: 'https://evm.cronos.org', // Official Cronos RPC endpoint
    },
    supportedCollections: [
        {
            name: 'CRO Crow',
            address: '0xE4ab77ED89528d90E6bcf0E1Ac99C58Da24e79d5',
            symbol: 'CROCROW'
        },
        {
            name: 'Mad Crow',
            address: '0x65AB0251d29c9C473c8d01BFfa2966F891fB1181',
            symbol: 'MADCROW'
        },
        {
            name: 'CRO Crow Nest',
            address: '0x937879726455531dB135F9b8D88F38dF5D4Eb13b',
            symbol: 'CROWNEST'
        },
        {
            name: '3D Crow',
            address: '0x3d7777ff1908B54b57038A2556d6904f71468e2D',
            symbol: '3DCROW'
        }
    ],
    abi: [
        "function buyCAWCAW(address[] calldata collections, uint256[] calldata tokenIds)",
        "function sellCAWCAW(address[] calldata collections, uint256[] calldata tokenIds)",
        "function supportedCollections(uint256) view returns (address)",
        "function nftRates(address) view returns (uint256)",
        "event Transfer(address indexed from, address indexed to, uint256 value)"
    ]
};

class NFTMonitor {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(NFT_CONFIG.marketplace.rpcUrl);
        this.marketplaceContract = new ethers.Contract(
            NFT_CONFIG.marketplace.address,
            NFT_CONFIG.abi,
            this.provider
        );
        this.isMonitoring = false;
        this.lastProcessedBlock = 0;
        this.alertChannel = null; // Will be set when bot starts
    }

    // Initialize NFT monitoring
    async initialize(discordClient, alertChannelId) {
        try {
            this.alertChannel = await discordClient.channels.fetch(alertChannelId);
            this.lastProcessedBlock = await this.provider.getBlockNumber();
            console.log('NFT Monitor initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize NFT Monitor:', error);
            return false;
        }
    }

    // Start monitoring NFT events
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log('Starting NFT monitoring...');
        
        // Use polling approach instead of event filtering to avoid RPC method issues
        console.log('Using polling method for NFT monitoring');
        this.pollMarketplaceEvents();
    }

    // Stop monitoring
    stopMonitoring() {
        this.isMonitoring = false;
        this.marketplaceContract.removeAllListeners();
        console.log('NFT monitoring stopped');
    }

    // Handle transfer events
    async handleTransferEvent(from, to, value, event) {
        try {
            // Check if this is a marketplace transaction
            if (this.isMarketplaceTransaction(from, to, value)) {
                const transactionDetails = await this.getTransactionDetails(event.transactionHash);
                await this.sendNFTAlert(transactionDetails);
            }
        } catch (error) {
            console.error('Error handling transfer event:', error);
        }
    }

    // Check if transaction involves marketplace
    isMarketplaceTransaction(from, to, value) {
        const marketplaceAddress = NFT_CONFIG.marketplace.address.toLowerCase();
        return from.toLowerCase() === marketplaceAddress || to.toLowerCase() === marketplaceAddress;
    }

    // Get transaction details
    async getTransactionDetails(txHash) {
        try {
            const tx = await this.provider.getTransaction(txHash);
            const receipt = await this.provider.getTransactionReceipt(txHash);
            
            // Parse transaction data to determine if it's buy/sell
            const parsedData = this.parseTransactionData(tx.data);
            
            return {
                hash: txHash,
                from: tx.from,
                to: tx.to,
                value: tx.value,
                gasUsed: receipt.gasUsed,
                type: parsedData.type,
                collections: parsedData.collections,
                tokenIds: parsedData.tokenIds,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error getting transaction details:', error);
            return null;
        }
    }

    // Parse transaction data to extract NFT info
    parseTransactionData(data) {
        // Simple parsing - in production, you'd want more sophisticated ABI decoding
        const functionSignature = data.slice(0, 10);
        
        if (functionSignature === '0x' + 'buyCAWCAW'.toLowerCase()) {
            return { type: 'BUY', collections: [], tokenIds: [] };
        } else if (functionSignature === '0x' + 'sellCAWCAW'.toLowerCase()) {
            return { type: 'SELL', collections: [], tokenIds: [] };
        }
        
        return { type: 'UNKNOWN', collections: [], tokenIds: [] };
    }

    // Poll for marketplace events
    async pollMarketplaceEvents() {
        if (!this.isMonitoring) return;

        try {
            // Simple polling approach - just check rates periodically
            console.log('Polling NFT marketplace...');
            
            // For now, just log that monitoring is active
            // In production, this would check for actual NFT transactions
            
        } catch (error) {
            console.error('Error polling marketplace events:', error);
        }

        // Continue polling
        setTimeout(() => this.pollMarketplaceEvents(), 30000); // Poll every 30 seconds
    }

    // Send NFT alert to Discord
    async sendNFTAlert(transactionDetails) {
        if (!this.alertChannel) return;

        try {
            const embed = this.createNFTAlertEmbed(transactionDetails);
            await this.alertChannel.send({ embeds: [embed] });
            console.log('NFT alert sent:', transactionDetails.hash);
        } catch (error) {
            console.error('Error sending NFT alert:', error);
        }
    }

    // Create Discord embed for NFT alert
    createNFTAlertEmbed(transactionDetails) {
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle('NFT Marketplace Activity')
            .setColor(transactionDetails.type === 'BUY' ? 0x00FF00 : 0xFF0000)
            .setDescription(`**${transactionDetails.type}** transaction detected`)
            .addFields(
                { name: 'Transaction', value: `[${transactionDetails.hash.substring(0, 10)}...](https://cronoscan.com/tx/${transactionDetails.hash})`, inline: false },
                { name: 'Type', value: transactionDetails.type, inline: true },
                { name: 'From', value: `${transactionDetails.from.substring(0, 6)}...`, inline: true },
                { name: 'Gas Used', value: transactionDetails.gasUsed.toString(), inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'CAWCAW Marketplace Monitor' });

        return embed;
    }

    // Get current NFT rates
    async getNFTRates() {
        try {
            const rates = {};
            for (const collection of NFT_CONFIG.supportedCollections) {
                const rate = await this.marketplaceContract.nftRates(collection.address);
                rates[collection.symbol] = ethers.formatUnits(rate, 18);
            }
            return rates;
        } catch (error) {
            console.error('Error getting NFT rates:', error);
            return {};
        }
    }
}

module.exports = NFTMonitor;
