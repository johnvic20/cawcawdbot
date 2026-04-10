# Quick Start Guide

## 1. Get Your Discord Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" tab → "Add Bot"
4. Enable **MESSAGE CONTENT INTENT** under "Privileged Gateway Intents"
5. Copy the bot token

## 2. Configure the Bot

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Discord bot token:
   ```
   DISCORD_TOKEN=your_actual_bot_token_here
   ```

## 3. Invite Bot to Your Server

Generate an invite link with these permissions:
- Read Messages/View Channels
- Send Messages
- Read Message History
- Use External Emojis
- Embed Links

## 4. Run the Bot

```bash
npm start
```

## 5. Test It

Type "cawcaw" in any channel where the bot is present!

The bot will respond with real-time CAWCAW token information including:
- Current price (USD and native)
- 24h volume and liquidity
- Price changes
- Market cap and FDV
- Direct link to DexScreener

## Current Token

The bot is configured to track **CAWCAW (Crow Coin)** token on Cronos chain:
- Address: `0x777cccA4e5dCCA8c85978a94bD65aA83ccBE8395`
- Symbol: `CAWCAW`
- Chain: Cronos
- Primary DEX: Ebisus Bay
- Trading Pair: `0xb377DF33f200b92A4dEec6eE6B40ed0b4b4A7293`

You can change the token in the `.env` file if needed.
