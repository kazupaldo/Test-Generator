import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getStock } from '../bloxgen.js';
import { COLORS } from '../config.js';
import { getUserApiKey } from '../lib/api-keys.js';

function isInStock(value) {
  return value === true || value?.available === true;
}

export function buildStockReply(data) {
  const lines = Object.entries(data ?? {}).map(([type, value]) => {
    const inStock = isInStock(value);
    return `${inStock ? '🟢' : '🔴'} \`${type}\` — ${inStock ? 'in stock' : 'out of stock'}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('Live account stock')
    .setColor(COLORS.brand)
    .setDescription(lines.join('\n') || 'No stock info available.')
    .setFooter({ text: 'Checked directly with the BloxGen API' })
    .setTimestamp();

  const refresh = new ButtonBuilder()
    .setCustomId('stock-refresh')
    .setLabel('Refresh live stock')
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Secondary);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(refresh)],
  };
}

export default {
  name: 'stock',
  async execute({ message }) {
    const data = await getStock(getUserApiKey(message?.author?.id));
    return buildStockReply(data);
  },
};
