// Shared account-generation logic used by the command and the panel/button.
import { generate } from '../bloxgen.js';
import { checkVoiceChat } from '../roblox.js';
import { buildAccountEmbed, generateAgainRow } from './ui.js';
import { logGeneration } from './logger.js';

// Generates an account, checks its voice chat status, logs it, and returns the
// message payload (embed + button).
export async function generateAccount(client, { type, user, guildId, apiKey }) {
  const acc = await generate(type, apiKey);
  const voice = await checkVoiceChat(acc.cookie); // null if the lookup fails
  await logGeneration(client, { user, type, acc, guildId });
  return { embeds: [buildAccountEmbed(acc, voice)], components: [generateAgainRow(type)] };
}
