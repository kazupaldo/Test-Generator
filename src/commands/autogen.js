import { PermissionFlagsBits } from 'discord.js';
import { buildAutoGenerationPanel } from '../lib/ui.js';
import {
  setAutoGenerationInterval,
  setAutoGenerationPriority,
} from '../lib/auto-generation.js';

export default {
  name: 'autogen',
  aliases: ['autogenerate', 'auto'],
  execute({ message, args }) {
    if (!message.guild) {
      return 'This command can only be used in a server.';
    }
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return '❌ You need the **Manage Server** permission to control auto-generation.';
    }
    const action = (args[0] || '').toLowerCase();
    if (action === 'interval') {
      const seconds = Number(args[1]);
      if (!Number.isFinite(seconds) || seconds < 5 || seconds > 3600) {
        return '❌ Interval must be between 5 and 3600 seconds. Disable auto-generation before changing it.';
      }
      if (!setAutoGenerationInterval(message.guildId, seconds)) {
        return '❌ Disable auto-generation before changing its interval.';
      }
      return `✅ Auto-generation interval set to **${seconds} seconds**.`;
    }
    if (action === 'priority') {
      const types = args.slice(1).join(' ').split(',').map((type) => type.trim()).filter(Boolean);
      if (!types.length || !setAutoGenerationPriority(message.guildId, types)) {
        return '❌ Use `+autogen priority alt,+1 year old,dump` while auto-generation is disabled.';
      }
      return `✅ Auto-generation priority set to **${types.join(' → ')}**.`;
    }
    return buildAutoGenerationPanel(message.guildId);
  },
};