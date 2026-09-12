import { PermissionFlagsBits } from 'discord.js';
import { PREFIX } from '../config.js';
import { getLogChannel, setLogChannel } from '../lib/settings.js';

export default {
  name: 'logs',
  async execute({ message, args }) {
    if (!message.guild) {
      return 'This command can only be used in a server.';
    }
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return '❌ You need the **Manage Server** permission to change this.';
    }

    const arg = (args[0] || '').toLowerCase();

    // No argument -> show the current log channel.
    if (!arg) {
      const current = getLogChannel(message.guildId);
      if (current) return `Generations are logged to <#${current}>.\nUse \`${PREFIX}logs here\`, \`${PREFIX}logs #channel\` or \`${PREFIX}logs off\`.`;
      return `No log channel set. Use \`${PREFIX}logs here\` or \`${PREFIX}logs #channel\` to enable logging.`;
    }

    // Disable logging.
    if (['off', 'disable', 'none', 'stop'].includes(arg)) {
      setLogChannel(message.guildId, null);
      return '✅ Logging disabled.';
    }

    // Resolve the target channel: #mention, "here", or a raw ID.
    let channel = message.mentions.channels.first();
    if (!channel && arg === 'here') channel = message.channel;
    if (!channel && /^\d+$/.test(arg)) {
      channel = message.guild.channels.cache.get(arg);
    }

    if (!channel) {
      return `❌ Couldn't find that channel. Use \`${PREFIX}logs here\`, \`${PREFIX}logs #channel\`, an ID, or \`${PREFIX}logs off\`.`;
    }
    if (!channel.isTextBased()) {
      return '❌ That channel is not a text channel.';
    }

    setLogChannel(message.guildId, channel.id);
    return `✅ Generations will now be logged to <#${channel.id}>.`;
  },
};
