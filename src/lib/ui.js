// Reusable embeds and message components.
import {
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { ACCOUNT_TYPES } from '../bloxgen.js';
import { COLORS } from '../config.js';
import {
  AUTO_GENERATION_INTERVAL_MS,
  AUTO_GENERATION_TYPES,
  getAutoGenerationStatus,
  getAutoGenerationTypes,
} from './auto-generation.js';

// Embed shown for a generated account. `voice` (optional) comes from the Roblox
// voice settings API: { enabled, verified } or null if the lookup failed.
export function buildAccountEmbed(acc, voice) {
  const hasValue = (value) => {
    if (value === undefined || value === null || value === '') return false;
    return !['unknown', 'n/a', 'null', 'undefined'].includes(String(value).trim().toLowerCase());
  };
  const valueOf = (...keys) => {
    for (const key of keys) {
      if (hasValue(acc[key])) return acc[key];
    }
    return null;
  };
  const show = (value, fallback = '—') => {
    if (!hasValue(value)) return fallback;
    return String(value)
      .replaceAll('\r', ' ')
      .replaceAll('\n', ' ')
      .replaceAll('`', 'ˋ')
      .slice(0, 900);
  };
  const inline = (value, fallback = '—') => `\`${show(value, fallback)}\``;
  const showBoolean = (value) => {
    return value === true || value === 'true' ? 'Yes' : 'No';
  };
  const formatDate = (value) => {
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return show(value);
    return new Date(timestamp).toISOString().slice(0, 10);
  };
  const userId = valueOf('id', 'userId', 'userid');
  const displayName = valueOf('displayName', 'display_name') ?? acc.username;
  const createdAt = valueOf('accountCreatedAt', 'account_created_at', 'createdAt', 'created_at');
  const age = valueOf('estimated_age', 'estimatedAge');
  const ageGroup = valueOf('estimated_age_group', 'estimatedAgeGroup');
  const descriptionLines = [
    `**Username:** ${inline(acc.username)}`,
    `**Password:** ${inline(acc.password)}`,
  ];

  if (hasValue(userId)) descriptionLines.push(`**User identifier:** ${inline(userId)}`);
  if (hasValue(displayName)) descriptionLines.push(`**Display name:** ${inline(displayName)}`);
  if (hasValue(createdAt)) descriptionLines.push(`**Account creation date:** ${formatDate(createdAt)}`);
  if (hasValue(acc.region)) descriptionLines.push(`**Region:** ${show(acc.region)}`);
  if (hasValue(acc.email_verified)) descriptionLines.push(`**Email verified:** ${showBoolean(acc.email_verified)}`);
  if (hasValue(acc.age_verified)) descriptionLines.push(`**Age verified:** ${showBoolean(acc.age_verified)}`);
  if (hasValue(age)) {
    descriptionLines.push(
      `**Estimated age:** ${show(age)}${hasValue(ageGroup) ? ` (${show(ageGroup)})` : ''}`,
    );
  }

  if (acc.cost != null) descriptionLines.push(`**Cost:** ${show(`$${acc.cost}`)}`);
  if (acc.robux != null) descriptionLines.push(`**Robux:** ${show(acc.robux)}`);
  if (acc.rap != null) descriptionLines.push(`**RAP:** ${show(acc.rap)}`);
  if (acc.summary != null) descriptionLines.push(`**Summary:** ${show(acc.summary)}`);
  if (voice) {
    descriptionLines.push(
      `**Voice chat:** ${voice.enabled ? 'Enabled' : 'Disabled'}${voice.verified ? ' · verified' : ''}`,
    );
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: 'Kazu' })
    .setTitle(`New ${acc.type || 'Roblox'} account`)
    .setColor(COLORS.success)
    .setDescription(descriptionLines.join('\n').slice(0, 4090))
    .setFooter({ text: 'Contact - Generator' })
    .setTimestamp();
  if (acc.avatarUrl) embed.setThumbnail(acc.avatarUrl);
  if (acc.cookie) {
    const cookie = String(acc.cookie);
    const cookieValue = `\`\`\`\n${cookie}\n\`\`\``;
    embed.addFields({
      name: '.ROBLOSECURITY cookie',
      value: cookieValue.length <= 1024
        ? cookieValue
        : 'The cookie is included in the attached private account file.',
    });
  }
  return embed;
}

export function buildAccountFile(acc) {
  if (!acc.cookie) return null;
  const contents = [
    `username: ${acc.username ?? ''}`,
    `password: ${acc.password ?? ''}`,
    `cookie: ${acc.cookie}`,
  ].join('\n');
  return new AttachmentBuilder(Buffer.from(contents, 'utf8'), {
    name: `bloxgen-${String(acc.username || 'account').replace(/[^a-z0-9_-]/gi, '_')}.txt`,
  });
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

export function accountActionsRow(type, username, ownerId) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gen-again:${type}`)
      .setLabel('Generate again')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary),
  );

  if (username && ownerId) {
    row.addComponents(passwordChangeButton(username, ownerId));
  }
  return row;
}

function passwordChangeButton(username, ownerId) {
  return new ButtonBuilder()
    .setCustomId(`password-change:${ownerId}:${encodeURIComponent(username)}`)
    .setLabel('Change password')
    .setEmoji('🔐')
    .setStyle(ButtonStyle.Secondary);
}

export function passwordChangeRow(username, ownerId) {
  return new ActionRowBuilder().addComponents(passwordChangeButton(username, ownerId));
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
  const statusText = status.enabled
    ? status.waitingReason
      ? `Enabled. ${status.waitingReason}`
      : 'Enabled. Auto-generation will continue until an admin presses **Disable**.'
    : 'Disabled. Nothing will be generated until an admin presses **Enable**.';

  const embed = new EmbedBuilder()
    .setColor(status.enabled ? COLORS.success : COLORS.brand)
    .setTitle('Auto-generation')
    .setDescription(
      `${statusText}\n\n` +
      `Generates immediately, then one account every **${formatDuration(AUTO_GENERATION_INTERVAL_MS)}** until disabled.\n` +
      'Before each cycle, the bot refreshes stock and daily limits, skips unavailable or limited categories, then checks again on the next cycle.\n' +
      'Accounts follow the server’s current DM, channel, or DM + channel delivery setting.',
    )
    .addFields({
      name: 'Selected categories',
      value: status.types.map((type) => `\`${type}\``).join(' · '),
      inline: true,
    });

  if (status.enabled) {
    embed.addFields(
      {
        name: '📊 Run totals',
        value: `Generated: **${status.generatedCount}**\nSkipped/checks: **${status.skippedCount}**\nAttempts: **${status.attemptCount}**`,
        inline: true,
      },
      {
        name: '🔄 Automatic checks',
        value: `Stock: **${status.stockAvailableCount ?? '?'}/${status.selectedTypeCount}** selected in stock\nDaily remaining: **${status.remainingGenerations ?? 'unknown'}**\nLimit-blocked: **${status.limitBlockedTypes?.length ? status.limitBlockedTypes.join(', ') : 'none'}**\nCooldown-skipped: **${status.cooldownTypes?.length ? status.cooldownTypes.join(', ') : 'none'}**\nLast refresh: ${status.lastStockCheckAt ? `<t:${Math.floor(status.lastStockCheckAt / 1000)}:R>` : '—'}`,
        inline: true,
      },
      {
        name: '🔎 Last activity',
        value: `Last type: **${status.lastType || '—'}**\nLast stock check: ${status.lastStockCheckAt ? `<t:${Math.floor(status.lastStockCheckAt / 1000)}:R>` : '—'}\nLast limit check: ${status.lastLimitCheckAt ? `<t:${Math.floor(status.lastLimitCheckAt / 1000)}:R>` : '—'}`,
        inline: true,
      },
    );
  }

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
