import { EmbedBuilder } from 'discord.js';
import { getDailyLimit } from '../bloxgen.js';
import { COLORS } from '../config.js';

export default {
  name: 'limits',
  async execute({ apiKey }) {
    const data = await getDailyLimit(apiKey);
    const embed = new EmbedBuilder()
      .setTitle('Daily generation limits')
      .setColor(COLORS.brand)
      .setDescription(
        `Total today: **${data.generationsToday}/${data.dailyLimit}** ` +
          `(**${data.remainingGenerations}** left)`,
      );

    for (const t of data.accountTypes ?? []) {
      embed.addFields({
        name: `${t.canGenerate ? '🟢' : '🔴'} ${t.accountType}`,
        value: `${t.generationsToday}/${t.dailyLimit} used`,
        inline: true,
      });
    }
    if (data.resetTime) embed.setFooter({ text: `Resets at ${data.resetTime}` });
    return { embeds: [embed] };
  },
};
