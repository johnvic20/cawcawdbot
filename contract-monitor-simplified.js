const { ethers } = require('ethers');

// Contract monitoring configuration
const CONTRACT_CONFIG = {
    token: {
        address: '0x777cccA4e5dCCA8c85978a94bD65aA83ccBE8395',
        name: 'CAWCAW',
        rpcUrl: 'https://evm.cronos.org'
    },
    alertChannel: process.env.CONTRACT_ALERT_CHANNEL_ID || null
};

// NFT collection addresses to monitor for transfers to CAWCAW contract
const NFT_COLLECTIONS = {
    '3DCROW': '0x3d7777ff1908b54b57038a2556d6904f71468e2d',
    'CROCROW': '0xE4ab77ED89528d90E6bcf0E1Ac99C58Da24e79d5',
    'CROCROWNEST': '0x937879726455531dB135F9b8D88F38dF5D4Eb13b',
    'MADCROW': '0x65AB0251d29c9C473c8d01BFfa2966F891fB1181',
    'CROWPUNK': '0x0f1439A290E86a38157831Fe27a3dCD302904055'
};

class ContractMonitor {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(CONTRACT_CONFIG.token.rpcUrl);
        this.isMonitoring = false;
        this.lastProcessedBlock = 0;
        this.alertChannel = null;
    }

    // Initialize contract monitoring
    async initialize(discordClient, alertChannelId) {
        try {
            this.alertChannel = await discordClient.channels.fetch(alertChannelId);
            this.lastProcessedBlock = await this.provider.getBlockNumber();
            console.log('Contract Monitor initialized');
            return true;
        } catch (error) {
            console.error('Failed to initialize Contract Monitor:', error);
            return false;
        }
    }

    // Start monitoring
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        console.log('Starting contract event monitoring...');
        this.monitorContractEvents();
    }

    // Stop monitoring
    stopMonitoring() {
        this.isMonitoring = false;
        console.log('Contract monitoring stopped');
    }

    // Monitor NFT transfers to CAWCAW contract using polling
    async monitorContractEvents() {
        if (!this.isMonitoring) return;

        try {
            console.log('Polling NFT events...');
            
            // Get current block number
            const currentBlock = await this.provider.getBlockNumber();
            
            // Check for new blocks since last processed
            if (currentBlock > this.lastProcessedBlock) {
                const fromBlock = this.lastProcessedBlock + 1;
                const toBlock = currentBlock;
                
                // Monitor NFT transfers to CAWCAW contract
                const nftFilters = [];
                for (const [name, address] of Object.entries(NFT_COLLECTIONS)) {
                    nftFilters.push({
                        address: address,
                        topics: [
                            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // Transfer event signature
                        ],
                        fromBlock,
                        toBlock
                    });
                }
                
                // Get logs from all NFT collections
                const allNftLogs = [];
                for (const filter of nftFilters) {
                    try {
                        const logs = await this.provider.getLogs(filter);
                        allNftLogs.push(...logs);
                    } catch (error) {
                        console.log(`Failed to get logs for ${name}:`, error.message);
                    }
                }
                
                // Process NFT logs only
                for (const log of allNftLogs) {
                    await this.processNftLog(log);
                }
                
                this.lastProcessedBlock = currentBlock;
            }
            
        } catch (error) {
            console.error('Error polling contract events:', error);
        }

        // Continue polling every 15 seconds
        setTimeout(() => this.monitorContractEvents(), 15000);
    }

    // Process NFT Transfer log (NFT sent to CAWCAW contract)
    async processNftLog(log) {
        try {
            // Check if NFT was transferred to CAWCAW contract
            if (log.topics && log.topics[2]) {
                const toAddress = '0x' + log.topics[2].slice(-40);
                
                if (toAddress.toLowerCase() === CONTRACT_CONFIG.token.address.toLowerCase()) {
                    // Decode log to get Transfer event data
                    const iface = new ethers.Interface([
                        'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'
                    ]);
                    
                    const parsedLog = iface.parseLog(log);
                    if (parsedLog && parsedLog.args) {
                        const { from, tokenId } = parsedLog.args;
                        
                        // Find which NFT collection this is
                        const collectionName = this.getCollectionName(log.address);
                        const rate = this.getNftRate(log.address);
                        
                        if (collectionName && rate) {
                            const transactionDetails = await this.getTransactionDetails(log.transactionHash);
                            await this.sendNftAlert(transactionDetails, collectionName, tokenId.toString(), from, rate);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error processing NFT log:', error);
        }
    }

    // Get collection name from address
    getCollectionName(address) {
        const collections = {
            [NFT_COLLECTIONS['3DCROW']]: '3D Crow',
            [NFT_COLLECTIONS['CROCROW']]: 'CRO Crow',
            [NFT_COLLECTIONS['CROCROWNEST']]: 'CRO Crow Nest',
            [NFT_COLLECTIONS['MADCROW']]: 'Mad Crow',
            [NFT_COLLECTIONS['CROWPUNK']]: 'Crow Punk'
        };
        return collections[address.toLowerCase()];
    }

    // Get NFT rate from address
    getNftRate(address) {
        const rates = {
            [NFT_COLLECTIONS['3DCROW']]: 130,
            [NFT_COLLECTIONS['CROCROW']]: 400,
            [NFT_COLLECTIONS['CROCROWNEST']]: 1700,
            [NFT_COLLECTIONS['MADCROW']]: 400,
            [NFT_COLLECTIONS['CROWPUNK']]: 288
        };
        return rates[address.toLowerCase()];
    }

    // Get transaction details
    async getTransactionDetails(txHash) {
        try {
            const tx = await this.provider.getTransaction(txHash);
            const receipt = await this.provider.getTransactionReceipt(txHash);
            
            return {
                hash: txHash,
                from: tx.from,
                to: tx.to,
                value: ethers.formatEther(tx.value),
                gasUsed: receipt.gasUsed,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('Error getting transaction details:', error);
            return null;
        }
    }

    // Send NFT alert to Discord
    async sendNftAlert(transactionDetails, collectionName, tokenId, from, rate) {
        if (!this.alertChannel) return;

        try {
            const embed = this.createNftAlertEmbed(transactionDetails, collectionName, tokenId, from, rate);
            await this.alertChannel.send({ embeds: [embed] });
            console.log(`NFT alert sent: ${collectionName} #${tokenId} sold to vault`);
        } catch (error) {
            console.error('Error sending NFT alert:', error);
        }
    }

    // Create Discord embed for NFT alert
    createNftAlertEmbed(transactionDetails, collectionName, tokenId, from, rate) {
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle(`🎨 NFT Vault Deposit`)
            .setColor(0xFF6B6B)
            .setDescription(`**${collectionName} #${tokenId}** deposited into vault`)
            .addFields(
                { name: 'Collection', value: collectionName, inline: true },
                { name: 'Token ID', value: `#${tokenId}`, inline: true },
                { name: 'From', value: `${from.substring(0, 6)}...`, inline: true },
                { name: 'Rate', value: `${rate} ${CONTRACT_CONFIG.token.name}`, inline: true },
                { name: 'Transaction', value: `[${transactionDetails.hash.substring(0, 10)}...](https://cronoscan.com/tx/${transactionDetails.hash})`, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: `${CONTRACT_CONFIG.token.name} Contract Monitor` });

        return embed;
    }
}

module.exports = ContractMonitor;
