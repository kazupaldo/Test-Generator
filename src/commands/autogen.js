import { PermissionFlagsBits } from 'discord.js';
import { buildAutoGenerationPanel } from '../lib/ui.js';

export default {
  name: 'autogen',
  aliases: ['autogenerate', 'auto'],
  execute({ message }) {
    if (!message.guild) {
      return 'This command can only be used in a server.';
    }
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return '❌ You need the **Manage Server** permission to control auto-generation.';
    }
    return buildAutoGenerationPanel(message.guildId);
  },
};