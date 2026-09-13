import { EmbedBuilder } from 'discord.js';
import { getDailyLimit } from '../bloxgen.js';
import { COLORS } from '../config.js';
import { getUserApiKey } from '../lib/api-keys.js';

export default {
  name: 'limits',
  async execute({ message }) {
    const data = await getDailyLimit(getUserApiKey(message?.author?.id));
    const total = data.dailyLimit == null
      ? `Used today: **${data.generationsToday ?? 'unknown'}**`
      : `Total today: **${data.generationsToday ?? 0}/${data.dailyLimit}**`;
    const embed = new EmbedBuilder()
      .setTitle('Daily generation limits')
      .setColor(COLORS.brand)
      .setDescription(
        `${total} ` +
          `(**${data.remainingGenerations ?? 'unknown'}** left)\n` +
          'The values below are refreshed from BloxGen for this request.',
      );

    for (const t of data.accountTypes ?? []) {
      const used = t.generationsToday ?? 0;
      const limit = t.dailyLimit ?? '?';
      embed.addFields({
        name: `${t.canGenerate ? '🟢' : '🔴'} ${t.accountType}`,
        value: `${used}/${limit} used · ${t.remainingGenerations ?? '?'} left`,
        inline: true,
      });
    }
    if (data.resetTime) embed.setFooter({ text: `Resets at ${data.resetTime}` });
    return { embeds: [embed] };
  },
};
