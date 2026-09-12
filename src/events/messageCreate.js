import { PREFIX } from '../config.js';
import { commands } from '../commands/index.js';

// Reply without ever throwing (e.g. missing permissions, deleted message).
async function safeReply(message, content) {
  try {
    await message.reply(content);
  } catch (err) {
    console.error('Failed to send reply:', err.message);
  }
}

export const name = 'messageCreate';

export async function execute(message, client) {
  try {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const [name, ...args] = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const command = commands.get(name.toLowerCase());
    if (!command) return;

    try {
      const reply = await command.execute({ message, args, client });
      if (reply) await safeReply(message, reply);
    } catch (err) {
      console.error(`${PREFIX}${name} failed:`, err);
      await safeReply(message, `❌ ${err.message || 'Something went wrong.'}`);
    }
  } catch (err) {
    // Last-resort guard so a bad message can never crash the bot.
    console.error('messageCreate handler error:', err);
  }
}
