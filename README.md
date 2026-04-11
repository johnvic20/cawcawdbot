# Discord CAWCAW Token Bot

A Discord bot that displays token information, monitors NFT activity, and responds to commands with fun GIFs.

## Features

### Token Information
- Responds to messages containing "cawcaw" (case insensitive)
- Fetches real-time token data from DexScreener API
- Displays comprehensive token information including:
  - Current price (USD)
  - 24h trading volume
  - Liquidity by DEX pair (USDC, CAW, CRO)
  - Market cap and FDV
  - Direct links to DexScreener
- Beautiful embed formatting with emojis
- Error handling and user-friendly messages

### NFT Contract Monitoring
- **Real-time NFT Activity Monitoring**: Automatically monitors NFT transfers to/from the CAWCAW contract
- **Monitored Collections**: CRO CROW, CRO CROW NEST, MAD CROW, 3D CROW, CROW PUNK
- **Alert System**: Sends detailed alerts to designated Discord channel for:
  - NFT deposits to contract
  - NFT withdrawals from contract
  - Transaction details with explorer links
- **Smart Deduplication**: Prevents duplicate alerts using transaction hash tracking
- **15-second Intervals**: Continuous monitoring with efficient block scanning

### Token Supply Information
- **Circulating Supply Command**: Displays detailed token supply metrics
  - Total supply
  - Contract balance (tokens held by contract)
  - Circulating supply calculation
  - Circulation rate percentage
  - Contract hold rate percentage
- **Real-time Blockchain Data**: Fetches live data directly from smart contract

### Fun Commands
- **Destruction Command**: Shows a balcony destruction GIF from Bleach
  - Triggered by "destruction", "d", or "destroy"
  - Displays animated GIF directly in Discord embed

### Recent Improvements (Latest Version)
- **Memory Management**: Automatic cleanup to prevent memory leaks
- **Efficient Processing**: Optimized block scanning and message handling
- **Robust Error Handling**: Better error recovery and user feedback


## Setup

### Prerequisites

- Node.js 16.0 or higher
- A Discord bot token (create a bot at [Discord Developer Portal](https://discord.com/developers/applications))

### Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```

4. Edit the `.env` file with your Discord bot token and configuration:
   ```
   DISCORD_TOKEN=your_discord_bot_token_here
   TOKEN_ADDRESS=0x777cccA4e5dCCA8c85978a94bD65aA83ccBE8395
   TOKEN_NAME=CAWCAW
   CONTRACT_ALERT_CHANNEL_ID=your_alert_channel_id_here
   CRONOS_RPC_URL=https://cronos-evm.publicnode.com
   ```

### Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" tab and click "Add Bot"
4. Under "Privileged Gateway Intents", enable:
   - MESSAGE CONTENT INTENT
5. Copy the bot token and add it to your `.env` file
6. Generate an invite link with the following permissions:
   - Read Messages/View Channels
   - Send Messages
   - Read Message History
   - Use External Emojis
   - Embed Links

### Running the Bot

Development mode (with auto-restart):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## Usage

### Commands
- **"cawcaw"** - Displays current CAWCAW token information including price, volume, liquidity, and market cap
- **"circulating"** or **"c"** - Shows detailed token supply information (total supply, contract balance, circulating supply)
- **"destruction"**, **"d"**, or **"destroy"** - Shows a balcony destruction GIF from Bleach

### Automatic Features
- **NFT Monitoring**: The bot automatically monitors NFT transfers to/from the CAWCAW contract and sends alerts to the configured channel
- **Real-time Updates**: Token data is fetched live from DexScreener API

Simply type any of the above commands in any channel where the bot is present to get the corresponding information or GIF.

## Configuration

### Environment Variables
The bot uses the following environment variables in the `.env` file:

- `DISCORD_TOKEN`: Your Discord bot token (required)
- `TOKEN_ADDRESS`: The CAWCAW token contract address (default: `0x777cccA4e5dCCA8c85978a94bD65aA83ccBE8395`)
- `TOKEN_NAME`: Friendly name for the token (default: `CAWCAW`)
- `CONTRACT_ALERT_CHANNEL_ID`: Discord channel ID for NFT alerts (optional, disables alerts if not set)
- `CRONOS_RPC_URL`: Cronos RPC endpoint (default: `https://cronos-evm.publicnode.com`)

### NFT Collections Monitored
The bot automatically monitors these NFT collections for transfers to/from the CAWCAW contract:
- CRO CROW (`0xE4ab77ED89528d90E6bcf0E1Ac99C58Da24e79d5`)
- CRO CROW NEST (`0x937879726455531dB135F9b8D88F38dF5D4Eb13b`)
- MAD CROW (`0x65AB0251d29c9C473c8d01BFfa2966F891fB1181`)
- 3D CROW (`0x3d7777ff1908B54b57038A2556d6904f71468e2D`)
- CROW PUNK (`0x0f1439A290E86a38157831Fe27a3dCD302904055`)

## API Rate Limits

The bot uses the DexScreener API which has a rate limit of 300 requests per minute. The bot includes proper error handling for rate limiting and API failures.

## Troubleshooting

### Common Issues
- **Bot doesn't respond**: Make sure the bot has the MESSAGE CONTENT INTENT enabled and proper permissions
- **Token data not found**: Verify the token address is correct and the token exists on DexScreener
- **API errors**: Check your internet connection and DexScreener API status

## License

MIT License
