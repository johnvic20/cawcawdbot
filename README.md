# Discord CAWCAW Token Bot

A Discord bot that tracks and displays token information from DexScreener when people say "cawcaw" in chat.

## Features

- Responds to messages containing "cawcaw" (case insensitive)
- Fetches real-time token data from DexScreener API
- Displays comprehensive token information including:
  - Current price (USD and native)
  - 24h trading volume
  - Liquidity
  - 24h price change
  - Market cap and FDV
  - DEX and chain information
- Beautiful embed formatting
- Error handling and user-friendly messages

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

4. Edit the `.env` file with your Discord bot token:
   ```
   DISCORD_TOKEN=your_discord_bot_token_here
   TOKEN_ADDRESS=0xb377df33f200b92a4deec6ee6b40ed0b4b4a7293
   TOKEN_NAME=CAWCAW
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

Simply type "cawcaw" in any channel where the bot is present, and it will respond with the current token information.

## Token Configuration

The bot is configured to track the CAWCAW token at address `0x777cccA4e5dCCA8c85978a94bD65aA83ccBE8395` on the Cronos chain. You can modify this in the `.env` file:

- `TOKEN_ADDRESS`: The contract address of the token to track
- `TOKEN_NAME`: A friendly name for the token (used in embed titles)

## API Rate Limits

The bot uses the DexScreener API which has a rate limit of 300 requests per minute. The bot includes proper error handling for rate limiting and API failures.

## Troubleshooting

- **Bot doesn't respond**: Make sure the bot has the MESSAGE CONTENT INTENT enabled and proper permissions
- **Token data not found**: Verify the token address is correct and the token exists on DexScreener
- **API errors**: Check your internet connection and DexScreener API status

## License

MIT License
