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

    // Monitor contract events
    async monitorContractEvents() {
        if (!this.isMonitoring) return;

        try {
            // Listen for Transfer events on the token contract
            this.tokenContract.on('Transfer', async (from, to, value, event) => {
                await this.handleTransferEvent(from, to, value, event);
            });

            console.log('Contract event monitoring started');
        } catch (error) {
            console.error('Error setting up contract monitoring:', error);
        }
    }

    // Handle Transfer events
    async handleTransferEvent(from, to, value, event) {
        try {
            // Check if this is a significant transaction (value > 0)
            if (value > 0n) {
                const transactionDetails = await this.getTransactionDetails(event.transactionHash);
                await this.sendContractAlert(transactionDetails);
            }
        } catch (error) {
            console.error('Error handling transfer event:', error);
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
