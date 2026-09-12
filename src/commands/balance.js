import { EmbedBuilder } from 'discord.js';
import { getBalance } from '../bloxgen.js';
import { COLORS } from '../config.js';

export default {
  name: 'balance',
  aliases: ['bal'],
  async execute({ apiKey }) {
    const data = await getBalance(apiKey);
    const embed = new EmbedBuilder()
      .setTitle('BloxGen balance')
      .setColor(COLORS.success)
      .setDescription(`**$${data.balance}**`);
    return { embeds: [embed] };
  },
};
