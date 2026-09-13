import { PermissionFlagsBits } from 'discord.js';
import { PREFIX } from '../config.js';
import { ACCOUNT_TYPES } from '../bloxgen.js';
import {
  getDelivery,
  getDeliveryChannel,
  getDeliveryChannelsByType,
  setDelivery,
  setDeliveryChannelForType,
} from '../lib/settings.js';

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
      const typeChannels = getDeliveryChannelsByType(message.guildId);
      const typeText = Object.entries(typeChannels).length
        ? `\nPer-type channels: ${Object.entries(typeChannels).map(([type, id]) => `\`${type}\` → <#${id}>`).join(', ')}`
        : '';
      return `Account delivery is currently set to **${current}**.${channelText}${typeText}\n` +
        `Use \`${PREFIX}settings dm\`, \`${PREFIX}settings server #channel\`, \`${PREFIX}settings both #channel\`, or \`${PREFIX}settings type <account type> #channel\`.`;
    }

    // Only server managers can change delivery (server mode exposes credentials publicly).
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return '❌ You need the **Manage Server** permission to change this.';
    }

    if (choice === 'type' || choice === 'type-route') {
      const selectedChannel = message.mentions?.channels?.first?.();
      const fallbackChannel = message.channel?.isTextBased?.() ? message.channel : null;
      const channel = selectedChannel ||
        (args[2] && message.guild.channels.cache.get(args[2])) ||
        (choice === 'type-route' && args[2] ? await message.guild.channels.fetch(args[2]).catch(() => null) : null);
      const type = choice === 'type-route'
        ? args[1]
        : args.slice(1)
          .filter((arg) => arg !== channel?.id && !/^<#\d+>$/.test(arg))
          .join(' ')
          .trim();

      if (!ACCOUNT_TYPES.includes(type)) {
        return `❌ Invalid account type. Available: ${ACCOUNT_TYPES.map((item) => `\`${item}\``).join(', ')}`;
      }
      if (!channel?.id && !fallbackChannel?.id) {
        return `❌ Select a channel. Use \`${PREFIX}settings type <account type> #channel\`.`;
      }
      const channelId = channel?.id || fallbackChannel.id;
      setDeliveryChannelForType(message.guildId, type, channelId);
      return `✅ **${type}** accounts will now be posted in <#${channelId}> when channel delivery is enabled.`;
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
      return `❌ Unknown option. Use \`${PREFIX}settings dm\`, \`${PREFIX}settings server #channel\`, \`${PREFIX}settings both #channel\`, or \`${PREFIX}settings type <account type> #channel\`.`;
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
