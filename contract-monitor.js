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

class ContractMonitor {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(CONTRACT_CONFIG.token.rpcUrl);
        this.tokenContract = new ethers.Contract(
            CONTRACT_CONFIG.token.address,
            [
                'event Transfer(address indexed from, address indexed to, uint256 value)',
                'event Approval(address indexed owner, address indexed spender, uint256 value)',
                'function balanceOf(address owner) view returns (uint256)',
                'function totalSupply() view returns (uint256)',
                'function name() view returns (string)',
                'function symbol() view returns (string)'
            ],
            this.provider
        );
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

    // Start monitoring contract events
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

    // Monitor contract events using polling
    async monitorContractEvents() {
        if (!this.isMonitoring) return;

        try {
            console.log('Contract polling monitoring started');
            this.pollContractEvents();
        } catch (error) {
            console.error('Error setting up contract monitoring:', error);
        }
    }

    // Poll for contract events
    async pollContractEvents() {
        if (!this.isMonitoring) return;

        try {
            console.log('Polling contract events...');
            
            // Get current block number
            const currentBlock = await this.provider.getBlockNumber();
            
            // Check for new blocks since last processed
            if (currentBlock > this.lastProcessedBlock) {
                const fromBlock = this.lastProcessedBlock + 1;
                const toBlock = currentBlock;
                
                // Get Transfer events from new blocks
                try {
                    const filter = {
                        address: CONTRACT_CONFIG.token.address,
                        topics: [
                            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef' // Transfer event signature
                        ],
                        fromBlock,
                        toBlock
                    };
                    
                    const logs = await this.provider.getLogs(filter);
                    
                    // Process each log
                    for (const log of logs) {
                        await this.processLog(log);
                    }
                    
                    this.lastProcessedBlock = currentBlock;
                } catch (logError) {
                    console.log('Failed to get logs, will retry next poll:', logError.message);
                }
            }
            
        } catch (error) {
            console.error('Error polling contract events:', error);
        }

        // Continue polling every 15 seconds
        setTimeout(() => this.pollContractEvents(), 15000);
    }

    // Process a single log entry
    async processLog(log) {
        try {
            // Decode the log to get Transfer event data
            const iface = new ethers.Interface([
                'event Transfer(address indexed from, address indexed to, uint256 value)'
            ]);
            
            const parsedLog = iface.parseLog(log);
            if (parsedLog && parsedLog.args) {
                const { from, to, value } = parsedLog.args;
                
                // Check if this is a significant transaction (value > 0)
                if (value > 0n) {
                    const transactionDetails = await this.getTransactionDetails(log.transactionHash);
                    await this.sendContractAlert(transactionDetails);
                }
            }
        } catch (error) {
            console.error('Error processing log:', error);
        }
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

    // Send contract alert to Discord
    async sendContractAlert(transactionDetails) {
        if (!this.alertChannel) return;

        try {
            const embed = this.createContractAlertEmbed(transactionDetails);
            await this.alertChannel.send({ embeds: [embed] });
            console.log('Contract alert sent:', transactionDetails.hash);
        } catch (error) {
            console.error('Error sending contract alert:', error);
        }
    }

    // Create Discord embed for contract alert
    createContractAlertEmbed(transactionDetails) {
        const { EmbedBuilder } = require('discord.js');
        
        // Determine transaction type based on addresses
        let transactionType = 'Transfer';
        let description = `**${ethers.formatEther(transactionDetails.value)} ${CONTRACT_CONFIG.token.name}** transferred`;
        
        // Check if it's a transfer to/from contract
        const isFromContract = transactionDetails.from.toLowerCase() === CONTRACT_CONFIG.token.address.toLowerCase();
        const isToContract = transactionDetails.to.toLowerCase() === CONTRACT_CONFIG.token.address.toLowerCase();
        
        if (isFromContract || isToContract) {
            transactionType = 'Contract Interaction';
            description = `**Contract interaction detected** - ${ethers.formatEther(transactionDetails.value)} ${CONTRACT_CONFIG.token.name}`;
        }
        
        const embed = new EmbedBuilder()
            .setTitle(`${CONTRACT_CONFIG.token.name} Contract Activity`)
            .setColor(0x00AE86)
            .setDescription(description)
            .addFields(
                { name: 'Transaction', value: `[${transactionDetails.hash.substring(0, 10)}...](https://cronoscan.com/tx/${transactionDetails.hash})`, inline: false },
                { name: 'Type', value: transactionType, inline: true },
                { name: 'From', value: `${transactionDetails.from.substring(0, 6)}...`, inline: true },
                { name: 'To', value: `${transactionDetails.to.substring(0, 6)}...`, inline: true },
                { name: 'Amount', value: `${ethers.formatEther(transactionDetails.value)} ${CONTRACT_CONFIG.token.name}`, inline: true },
                { name: 'Gas Used', value: transactionDetails.gasUsed.toString(), inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `${CONTRACT_CONFIG.token.name} Contract Monitor` });

        return embed;
    }
}

module.exports = ContractMonitor;
