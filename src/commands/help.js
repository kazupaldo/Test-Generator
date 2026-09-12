import { EmbedBuilder } from 'discord.js';
import { ACCOUNT_TYPES } from '../bloxgen.js';
import { PREFIX, COLORS } from '../config.js';

export default {
  name: 'help',
  execute({ client }) {
    const p = PREFIX;
    const embed = new EmbedBuilder()
      .setColor(COLORS.brand)
      .setAuthor({ name: 'BloxGen Bot', iconURL: client.user?.displayAvatarURL() })
      .setTitle('📖 Command Guide')
      .setDescription(`Generate Roblox accounts and more, right from Discord.\nUse the prefix **\`${p}\`** before each command.`)
      .addFields(
        {
          name: '🧬 Accounts',
          value: [
            `> **\`${p}generate [type]\`** — generate an account`,
            `> **\`${p}panel\`** — open the dropdown picker`,
            `> **\`${p}balance\`** — your BloxGen balance`,
            `> **\`${p}history [page]\`** — list your generated accounts`,
            `> **\`${p}history <username>\`** — DM that account's login`,
            `> **\`${p}history export [type] [page] [format]\`** — export filtered history (txt/csv/json)`,
          ].join('\n'),
        },
        {
          name: '📊 Info',
          value: [
            `> **\`${p}stock\`** — what's in stock`,
            `> **\`${p}prices\`** — price per type`,
            `> **\`${p}limits\`** — your daily limits`,
            `> **\`${p}status\`** — API & service health`,
          ].join('\n'),
        },
        {
          name: '🤝 Social Growth',
          value: `> **\`${p}followers <id>\`** — check available followers`,
        },
        {
          name: '⚙️ Config',
          value: [
            `> **\`${p}settings [dm|server|both] #channel\`** — DM, channel, or both *(admin)*`,
            `> **\`${p}logs [here|#channel|off]\`** — log generations *(admin)*`,
            `> **\`${p}autogen\`** — enable or disable 24-hour auto-generation *(admin)*`,
          ].join('\n'),
        },
        {
          name: '​',
          value: `**Account types:** ${ACCOUNT_TYPES.map((t) => `\`${t}\``).join(' · ')}`,
        },
      )
      .setFooter({ text: 'BloxGen API • docs.bloxgen.net' })
      .setTimestamp();

    if (client.user) embed.setThumbnail(client.user.displayAvatarURL());
    return { embeds: [embed] };
  },
};
