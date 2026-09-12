// Reusable embeds and message components.
import {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { ACCOUNT_TYPES } from '../bloxgen.js';
import { COLORS } from '../config.js';
import {
  AUTO_GENERATION_DURATION_MS,
  AUTO_GENERATION_INTERVAL_MS,
  AUTO_GENERATION_TYPES,
  getAutoGenerationStatus,
  getAutoGenerationTypes,
} from './auto-generation.js';

// Embed shown for a generated account. `voice` (optional) comes from the Roblox
// voice settings API: { enabled, verified } or null if the lookup failed.
export function buildAccountEmbed(acc, voice) {
  const embed = new EmbedBuilder()
    .setTitle('✅ Account generated')
    .setColor(COLORS.success)
    .addFields(
      { name: 'Username', value: '`' + acc.username + '`', inline: true },
      { name: 'Password', value: '`' + acc.password + '`', inline: true },
      { name: 'Type', value: String(acc.type), inline: true },
    );

  if (acc.id != null) embed.addFields({ name: 'User ID', value: String(acc.id), inline: true });
  if (acc.region) embed.addFields({ name: 'Region', value: acc.region, inline: true });
  if (acc.cost != null) embed.addFields({ name: 'Cost', value: `$${acc.cost}`, inline: true });
  if (acc.robux != null) embed.addFields({ name: 'Robux', value: String(acc.robux), inline: true });
  if (acc.rap != null) embed.addFields({ name: 'RAP', value: String(acc.rap), inline: true });
  if (acc.summary != null) embed.addFields({ name: 'Summary', value: String(acc.summary), inline: true });
  if (acc.email_verified != null) {
    embed.addFields({ name: 'Email verified', value: acc.email_verified ? 'Yes' : 'No', inline: true });
  }
  if (acc.age_verified != null) {
    embed.addFields({ name: 'Age verified', value: acc.age_verified ? 'Yes' : 'No', inline: true });
  }
  if (acc.estimated_age != null) {
    embed.addFields({ name: 'Estimated age', value: String(acc.estimated_age), inline: true });
  }
  if (acc.estimated_age_group) {
    embed.addFields({ name: 'Age group', value: String(acc.estimated_age_group), inline: true });
  }
  if (acc.avatarUrl) embed.setThumbnail(acc.avatarUrl);
  if (voice) {
    embed.addFields({
      name: '🎙️ Voice chat',
      value: `${voice.enabled ? '🟢 Enabled' : '🔴 Disabled'}${voice.verified ? ' · verified' : ''}`,
      inline: true,
    });
  }
  if (acc.cookie) {
    embed.addFields({ name: '.ROBLOSECURITY cookie', value: '```\n' + acc.cookie + '\n```' });
  }
  return embed;
}

// A "Generate again" button that regenerates the same type.
export function generateAgainRow(type) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gen-again:${type}`)
      .setLabel('Generate again')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );
}

// The dropdown panel to pick an account type.
export function buildPanel() {
  const embed = new EmbedBuilder()
    .setColor(COLORS.brand)
    .setTitle('🧬 Generate an account')
    .setDescription('Pick an account type from the menu below.\nYour account will be sent to your DMs.');

  const menu = new StringSelectMenuBuilder()
    .setCustomId('gen-select')
    .setPlaceholder('Choose an account type…')
    .addOptions(ACCOUNT_TYPES.map((t) => ({ label: t, value: t })));

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] };
}

function formatDuration(ms) {
  if (ms < 60000) {
    const seconds = Math.max(1, Math.round(ms / 1000));
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes >= 60) return `${Math.round(minutes / 60)} hour${minutes === 60 ? '' : 's'}`;
  return `${minutes} minutes`;
}

export function buildAutoGenerationPanel(guildId) {
  const status = getAutoGenerationStatus(guildId);
  const selected = getAutoGenerationTypes(guildId);
  const remaining = status.endsAt ? Math.max(0, status.endsAt - Date.now()) : AUTO_GENERATION_DURATION_MS;
  const statusText = status.enabled
    ? `Enabled. Next accounts rotate through the selected categories. Approximately **${formatDuration(remaining)}** remain.`
    : 'Disabled. Nothing will be generated until an admin presses **Enable**.';

  const embed = new EmbedBuilder()
    .setColor(status.enabled ? COLORS.success : COLORS.brand)
    .setTitle('Auto-generation')
    .setDescription(
      `${statusText}\n\n` +
      `Generates immediately, then one account every **${formatDuration(AUTO_GENERATION_INTERVAL_MS)}** for up to **24 hours**.\n` +
      'Before each attempt, the bot checks BloxGen stock and skips categories that are unavailable.\n' +
      'Accounts follow the server’s current DM, channel, or DM + channel delivery setting.',
    )
    .addFields({
      name: 'Selected categories',
      value: status.types.map((type) => `\`${type}\``).join(' · '),
    });

  const menu = new StringSelectMenuBuilder()
    .setCustomId('autogen-types')
    .setPlaceholder('Select one or more account categories…')
    .setMinValues(1)
    .setMaxValues(AUTO_GENERATION_TYPES.length)
    .setDisabled(status.enabled)
    .addOptions(
      AUTO_GENERATION_TYPES.map((type) => ({
        label: type,
        value: type,
        default: selected.includes(type),
      })),
    );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('autogen-enable')
      .setLabel('Enable')
      .setStyle(ButtonStyle.Success)
      .setDisabled(status.enabled),
    new ButtonBuilder()
      .setCustomId('autogen-disable')
      .setLabel('Disable')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!status.enabled),
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(menu),
      buttons,
    ],
  };
}
