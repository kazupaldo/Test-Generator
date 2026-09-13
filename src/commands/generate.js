import { PREFIX } from '../config.js';
import { ACCOUNT_TYPES } from '../bloxgen.js';
import { buildPanel } from '../lib/ui.js';
import { generateAccount } from '../lib/generation.js';
import { describeDirectMessageError } from '../lib/delivery.js';
import { deliverAccount } from '../lib/account-delivery.js';
import { recordGeneration } from '../lib/statistics.js';

export default {
  name: 'generate',
  aliases: ['gen'],
  async execute({ message, args, client }) {
    const type = args.join(' ').trim();

    // No type given -> show the interactive dropdown panel.
    if (!type) return buildPanel();

    if (!ACCOUNT_TYPES.includes(type)) {
      return `❌ Invalid type. Available: ${ACCOUNT_TYPES.map((t) => `\`${t}\``).join(', ')}`;
    }

    const payload = await generateAccount(client, {
      type,
      user: message.author,
      guildId: message.guildId,
      fallbackChannel: message.channel,
    });
    recordGeneration(message.guildId, type, 'generated');

    try {
      const result = await deliverAccount({
        client,
        guildId: message.guildId,
        fallbackChannel: message.channel,
        user: message.author,
        type,
        payload,
        account: payload.account,
        voice: payload.voice,
        ownerId: message.author.id,
        context: 'generate command',
      });
      recordGeneration(message.guildId, type, result.channelSent || result.dmSent ? 'successful' : 'failed',
        result.channelSent ? result.channelId : null);
      if (result.mode === 'both') {
        if (result.dmError) {
          return `⚠️ Account posted in <#${result.channelId}> but the DM failed: ${describeDirectMessageError(result.dmError)}`;
        }
        if (result.channelError) {
          return `⚠️ Account sent to your DMs, but the channel delivery failed: ${result.channelError.message}`;
        }
        return `✅ Account sent to your DMs and posted in <#${result.channelId}>.`;
      }
      if (result.mode === 'server') {
        return `✅ Account posted in <#${result.channelId}>.`;
      }
      return '📩 Account sent to your DMs.';
    } catch (err) {
      recordGeneration(message.guildId, type, 'failed');
      if (err.deliveryResult?.dmError) {
        return `❌ ${describeDirectMessageError(err.deliveryResult.dmError)}`;
      }
      return `❌ ${err.message || 'Could not deliver the generated account.'}`;
    }
  },
};
