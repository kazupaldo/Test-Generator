import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';

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
      'Your commands will use your key instead of the bot owner’s key.',
    components: [buttons],
  };
}

export function buildApiKeyModal() {
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
    .addComponents(new ActionRowBuilder().addComponents(input));
}

export default {
  name: 'key',
  aliases: ['apikey'],
  execute({ interaction }) {
    if (!interaction) {
      return 'Use `/key` to securely add or manage your personal BloxGen API key.';
    }
    return buildApiKeyPanel();
  },
};