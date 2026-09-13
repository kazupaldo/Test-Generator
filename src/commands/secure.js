import { ACCOUNT_TYPES } from '../bloxgen.js';
import { getHistory } from '../bloxgen-dashboard.js';
import { describeDirectMessageError, sendDirectMessage } from '../lib/delivery.js';
import { passwordChangeRow } from '../lib/ui.js';

function matchingType(value) {
  return ACCOUNT_TYPES.find((type) => type.toLowerCase() === String(value).toLowerCase()) ?? null;
}

export default {
  name: 'secure',
  aliases: ['setup', 'secureaccount'],
  async execute({ message, args }) {
    if (!args.length) {
      return 'Usage: `+secure <generated account username>` or `+secure type <account type>`';
    }

    const isTypeFilter = args[0].toLowerCase() === 'type';
    if (isTypeFilter) {
      const type = matchingType(args.slice(1).join(' ').trim());
      if (!type) {
        return `❌ Invalid account type. Available: ${ACCOUNT_TYPES.map((item) => `\`${item}\``).join(', ')}`;
      }

      try {
        const data = await getHistory({ page: 1, limit: 100 });
        const accounts = (data?.history ?? [])
          .filter((account) => String(account.type).toLowerCase() === type.toLowerCase())
          .slice(0, 5);
        if (!accounts.length) return `📭 No generated \`${type}\` accounts were found in the latest history page.`;

        await sendDirectMessage(message.author, {
          content: `🔐 Choose a \`${type}\` account to secure. Each password change is manual and requires the current password.`,
          components: accounts.map((account) => passwordChangeRow(account.username, message.author.id)),
        });
        return '📩 I sent the selected account actions to your DMs.';
      } catch (err) {
        return `❌ ${err.message || 'Could not load account history.'}`;
      }
    }

    const username = args.join(' ').trim();
    try {
      await sendDirectMessage(message.author, {
        content: '🔐 Click the button to change this password. The current password is required.',
        components: [passwordChangeRow(username, message.author.id)],
      });
      return '📩 I sent the private password action to your DMs.';
    } catch (err) {
      return `❌ ${describeDirectMessageError(err)}`;
    }
  },
};