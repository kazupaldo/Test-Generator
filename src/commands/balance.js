import { EmbedBuilder } from 'discord.js';
import { getBalance } from '../bloxgen.js';
import { COLORS } from '../config.js';
import { getUserApiKey } from '../lib/api-keys.js';

export default {
  name: 'balance',
  aliases: ['bal'],
  async execute({ message }) {
    const data = await getBalance(getUserApiKey(message?.author?.id));
    const embed = new EmbedBuilder()
      .setTitle('BloxGen balance')
      .setColor(COLORS.success)
      .setDescription(`**$${data.balance}**`);
    return { embeds: [embed] };
  },
};
