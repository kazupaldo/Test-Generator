import { EmbedBuilder } from 'discord.js';
import { getPrices } from '../bloxgen.js';
import { COLORS } from '../config.js';
import { getUserApiKey } from '../lib/api-keys.js';

export default {
  name: 'prices',
  async execute({ message }) {
    const data = await getPrices(getUserApiKey(message?.author?.id));
    const lines = Object.entries(data).map(([type, price]) => `\`${type}\` — $${price}`);
    const embed = new EmbedBuilder()
      .setTitle('Account prices')
      .setColor(COLORS.brand)
      .setDescription(lines.join('\n') || 'No price info available.');
    return { embeds: [embed] };
  },
};
