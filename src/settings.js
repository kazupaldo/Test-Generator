import { PermissionFlagsBits } from 'discord.js';
import { PREFIX } from '../config.js';
import { getDelivery, getDeliveryChannel, setDelivery } from '../lib/settings.js';

export default {
  name: 'settings',
  async execute({ message, args }) {
    const current = getDelivery(message.guildId);
    const currentChannel = getDeliveryChannel(message.guildId);

    if (!message.guild) {
      return 'Settings can only be changed in a server. (Accounts are always DMed in direct messages.)';
    }

    const choice = (args[0] || '').toLowerCase();
    if (!choice) {
      const channelText = currentChannel ? `\nDelivery channel: <#${currentChannel}>` : '';
      return `Account delivery is currently set to **${current}**.${channelText}\n` +
        `Use \`${PREFIX}settings dm\`, \`${PREFIX}settings server #channel\`, or \`${PREFIX}settings both #channel\`.`;
    }

    // Only server managers can change delivery (server mode exposes credentials publicly).
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return '❌ You need the **Manage Server** permission to change this.';
    }

    const map = {
      dm: 'dm',
      private: 'dm',
      server: 'server',
      channel: 'server',
      public: 'server',
      both: 'both',
      dual: 'both',
    };
    const mode = map[choice];
    if (!mode) {
      return `❌ Unknown option. Use \`${PREFIX}settings dm\`, \`${PREFIX}settings server #channel\`, or \`${PREFIX}settings both #channel\`.`;
    }

    const selectedChannel = message.mentions?.channels?.first?.();
    const fallbackChannel = message.channel?.isTextBased?.() ? message.channel : null;
    const channel = selectedChannel || (args[1] && message.guild.channels.cache.get(args[1])) || fallbackChannel;
    const channelId = channel?.id || currentChannel;

    if ((mode === 'server' || mode === 'both') && !channelId) {
      return `❌ Select a text channel. Use \`${PREFIX}settings ${mode} #channel\`.`;
    }

    setDelivery(message.guildId, mode, channelId);
    const channelText = channelId ? `<#${channelId}>` : 'the selected channel';
    if (mode === 'server') {
      return `✅ Generated accounts will now be **posted in ${channelText}**.\n⚠️ Anyone who can read the channel will see the credentials and cookie.`;
    }
    if (mode === 'both') {
      return `✅ Every generated account will be sent to your **DMs** and posted in **${channelText}**.\n⚠️ Anyone who can read the channel will see the credentials and cookie.`;
    }
    return '✅ Generated accounts will now be **sent privately via DM**.';
  },
};
