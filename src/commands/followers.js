import { EmbedBuilder } from 'discord.js';
import { checkFollowers } from '../bloxgen.js';
import { PREFIX, COLORS } from '../config.js';
import { getUserApiKey } from '../lib/api-keys.js';

export default {
  name: 'followers',
  async execute({ args, message }) {
    const userid = args.join(' ').trim();
    if (!userid) {
      return `Usage: \`${PREFIX}followers <roblox username or id>\``;
    }

    const data = await checkFollowers(userid, getUserApiKey(message?.author?.id));
    const embed = new EmbedBuilder()
      .setTitle('Followers availability')
      .setColor(data.available ? COLORS.success : COLORS.error)
      .addFields(
        { name: 'Account', value: String(data.userid), inline: true },
        { name: 'Available', value: data.available ? 'Yes' : 'No', inline: true },
        { name: 'Max followers', value: String(data.max_followers ?? 0), inline: true },
      );
    if (data.reason) embed.addFields({ name: 'Reason', value: data.reason });
    return { embeds: [embed] };
  },
};
