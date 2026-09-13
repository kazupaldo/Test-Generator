import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { PREFIX } from '../config.js';
import { listUserApiKeys, setActiveUserApiKey } from '../lib/api-keys.js';
import { describeDirectMessageError, sendDirectMessage } from '../lib/delivery.js';

export function buildApiKeyPanel() {
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('api-key-add')
      .setLabel('Add or replace key')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('api-key-status')
      .setLabel('Check status')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('api-key-remove')
      .setLabel('Remove key')
      .setStyle(ButtonStyle.Danger),
  );

  return {
    content:
      '🔐 **Personal BloxGen API key**\n' +
      'Add your key privately. It is encrypted before storage and is never shown in chat or logs. ' +
      'You can save multiple keys by giving each one a different name; your first key is used by default.',
    components: [buttons],
  };
}

export function buildApiKeyModal() {
  const name = new TextInputBuilder()
    .setCustomId('api-key-name')
    .setLabel('Key name (optional)')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(32)
    .setRequired(false)
    .setPlaceholder('default, premium, backup');
  const input = new TextInputBuilder()
    .setCustomId('api-key-value')
    .setLabel('BloxGen API key')
    .setStyle(TextInputStyle.Short)
    .setMinLength(8)
    .setMaxLength(256)
    .setRequired(true)
    .setPlaceholder('Paste your BloxGen API key');

  return new ModalBuilder()
    .setCustomId('api-key-submit')
    .setTitle('Add personal BloxGen API key')
    .addComponents(
      new ActionRowBuilder().addComponents(name),
      new ActionRowBuilder().addComponents(input),
    );
}

export default {
  name: 'key',
  aliases: ['apikey'],
  async execute({ interaction, message, args = [] }) {
    if (!interaction) {
      const action = (args[0] || '').toLowerCase();
      if (action === 'use' && args[1]) {
        return setActiveUserApiKey(message.author.id, args[1].toLowerCase())
          ? `✅ Active BloxGen key changed to \`${args[1].toLowerCase()}\`.`
          : `❌ No saved key named \`${args[1]}\`. Use \`${PREFIX}key\` to view the key panel.`;
      }
      const keys = listUserApiKeys(message.author.id);
      return keys.names.length
        ? `Saved keys: ${keys.names.map((name) => `\`${name}\``).join(', ')} · active: \`${keys.active}\`\nUse \`${PREFIX}key use <name>\` or \`${PREFIX}key\` to manage them.`
        : 'Use `/key` or `+key` to receive the private API-key setup panel.';
    }
    try {
      await sendDirectMessage(message.author, buildApiKeyPanel());
      return '📩 I sent the API-key setup panel to your DMs. Your key will never be requested in a server channel.';
    } catch (error) {
      return `❌ I could not DM you the private API-key setup panel. ${describeDirectMessageError(error)}`;
    }
  },
};