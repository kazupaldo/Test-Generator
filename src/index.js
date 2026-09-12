// Simple Discord bot for the BloxGen API — entry point.
import { Client, GatewayIntentBits } from 'discord.js';
import { DISCORD_TOKEN, BLOXGEN_API_KEY, PREFIX } from './config.js';
import * as messageCreate from './events/messageCreate.js';
import * as interactionCreate from './events/interactionCreate.js';
import { registerSlashCommands } from './slash-commands.js';

if (!DISCORD_TOKEN || !BLOXGEN_API_KEY) {
  console.error('Missing env vars. Copy .env.example to .env and fill DISCORD_TOKEN and BLOXGEN_API_KEY.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent, // privileged: enable in the Developer Portal
    GatewayIntentBits.DirectMessages,
  ],
});

client.once('clientReady', async (c) => {
  console.log(`Logged in as ${c.user.tag} — prefix "${PREFIX}"`);
  for (const guild of c.guilds.cache.values()) {
    try {
      await registerSlashCommands(c, guild);
    } catch (err) {
      console.error(`Failed to register slash commands in ${guild.name}:`, err.message);
    }
  }
});

client.on('guildCreate', async (guild) => {
  try {
    await registerSlashCommands(client, guild);
  } catch (err) {
    console.error(`Failed to register slash commands in ${guild.name}:`, err.message);
  }
});

// Wire up event modules.
for (const event of [messageCreate, interactionCreate]) {
  client.on(event.name, (...args) => event.execute(...args, client));
}

// Connection-level errors (don't crash, just log).
client.on('error', (err) => console.error('Client error:', err));
client.on('shardError', (err) => console.error('Shard error:', err));

// Global safety net: log unexpected errors instead of crashing the process.
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

try {
  await client.login(DISCORD_TOKEN);
} catch (err) {
  console.error('Failed to log in. Check your DISCORD_TOKEN in .env.');
  console.error(err.message);
  await client.destroy().catch(() => {});
  process.exitCode = 1;
}
