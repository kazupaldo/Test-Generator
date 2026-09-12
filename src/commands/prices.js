import { EmbedBuilder } from 'discord.js';
import { getPrices } from '../bloxgen.js';
import { COLORS } from '../config.js';

export default {
  name: 'prices',
  async execute() {
    const data = await getPrices();
    const lines = Object.entries(data).map(([type, price]) => `\`${type}\` — $${price}`);
    const embed = new EmbedBuilder()
      .setTitle('Account prices')
      .setColor(COLORS.brand)
      .setDescription(lines.join('\n') || 'No price info available.');
    return { embeds: [embed] };
  },
};
