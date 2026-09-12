// Logs generation events to a channel (best-effort, never throws).
import { EmbedBuilder } from 'discord.js';
import { LOG_CHANNEL_ID, COLORS } from '../config.js';
import { getLogChannel } from './settings.js';

// Per-server setting (+logs) takes priority over the LOG_CHANNEL_ID env fallback.
export async function logGeneration(client, { user, type, acc, guildId }) {
  const channelId = getLogChannel(guildId) || LOG_CHANNEL_ID;
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) return;

    const embed = new EmbedBuilder()
      .setColor(COLORS.brand)
      .setTitle('🧬 Account generated')
      .addFields(
        { name: 'User', value: `${user} (\`${user.id}\`)`, inline: false },
        { name: 'Type', value: String(type), inline: true },
        { name: 'Cost', value: acc.cost != null ? `$${acc.cost}` : 'n/a', inline: true },
        { name: 'Roblox ID', value: acc.id != null ? String(acc.id) : 'n/a', inline: true },
      )
      .setFooter({ text: guildId ? `Server ${guildId}` : 'Direct message' })
      .setTimestamp();
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Failed to log generation:', err.message);
  }
}
