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
  AUTO_GENERATION_DURATION_MS,
  AUTO_GENERATION_INTERVAL_MS,
  AUTO_GENERATION_TYPES,
  getAutoGenerationStatus,
  getAutoGenerationTypes,
} from './auto-generation.js';

// Embed shown for a generated account. `voice` (optional) comes from the Roblox
// voice settings API: { enabled, verified } or null if the lookup failed.
export function buildAccountEmbed(acc, voice) {
  const valueOf = (...keys) => {
    for (const key of keys) {
      if (acc[key] !== undefined && acc[key] !== null && acc[key] !== '') return acc[key];
    }
    return null;
  };
  const show = (value, fallback = 'unknown') => {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value)
      .replaceAll('\r', ' ')
      .replaceAll('\n', ' ')
      .replaceAll('`', 'ˋ')
      .slice(0, 900);
  };
  const inline = (value, fallback = 'unknown') => `\`${show(value, fallback)}\``;
  const showBoolean = (value) => {
    if (value === undefined || value === null || value === '') return 'unknown';
    return value === true || value === 'true' ? 'Yes' : 'No';
  };
  const formatDate = (value) => {
    if (!value) return 'unknown';
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return show(value);
    return new Date(timestamp).toISOString().slice(0, 10);
  };
  const formatInventory = (value) => {
    if (!Array.isArray(value)) return show(value);
    if (!value.length) return '0';
    return value
      .map((item) => typeof item === 'object' ? item.name ?? item.Name ?? 'item' : item)
      .join(', ')
      .replaceAll('`', 'ˋ')
      .slice(0, 850);
  };

  const userId = valueOf('id', 'userId', 'userid');
  const displayName = valueOf('displayName', 'display_name') ?? acc.username;
  const createdAt = valueOf('accountCreatedAt', 'account_created_at', 'createdAt', 'created_at');
  const banned = valueOf('banned', 'banned_status', 'isBanned');
  const friends = valueOf('friendsCount', 'friends_count', 'friends');
  const followers = valueOf('followersCount', 'followers_count', 'followers');
  const inventory = valueOf('inventoryItems', 'inventory_items', 'inventory');
  const age = valueOf('estimated_age', 'estimatedAge');
  const ageGroup = valueOf('estimated_age_group', 'estimatedAgeGroup');
  const descriptionLines = [
    `**Username:** ${inline(acc.username)}`,
    `**Password:** ${inline(acc.password)}`,
    `**User identifier:** ${inline(userId)}`,
    `**Display name:** ${inline(displayName)}`,
    `**Account creation date:** ${formatDate(createdAt)}`,
    `**Region:** ${show(acc.region, 'not available')}`,
    `**Email verified:** ${showBoolean(acc.email_verified)}`,
    `**Age verified:** ${showBoolean(acc.age_verified)}`,
    `**Estimated age:** ${age == null ? 'unknown' : `${show(age)}${ageGroup ? ` (${show(ageGroup)})` : ''}`}`,
    `**Banned status:** ${showBoolean(banned)}`,
    `**Friends count:** ${show(friends, 'unknown')}`,
    `**Followers count:** ${show(followers, 'unknown')}`,
    `**Inventory items${Array.isArray(inventory) ? ` (${inventory.length})` : ''}:** ${formatInventory(inventory)}`,
  ];

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
    ? status.pausedReason
      ? `Enabled but paused: ${status.pausedReason} Approximately **${formatDuration(remaining)}** remain.`
      : `Enabled. Smart generate is selecting the next stocked type under its daily limit. Approximately **${formatDuration(remaining)}** remain.`
    : 'Disabled. Nothing will be generated until an admin presses **Enable**.';

  const embed = new EmbedBuilder()
    .setColor(status.enabled ? COLORS.success : COLORS.brand)
    .setTitle('Auto-generation')
    .setDescription(
      `${statusText}\n\n` +
      `Generates immediately, then one account every **${formatDuration(AUTO_GENERATION_INTERVAL_MS)}** for up to **24 hours**.\n` +
      'Before each attempt, the bot refreshes stock and daily limits, skips unavailable or limited categories, and resumes automatically when stock returns or limits reset.\n' +
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
        value: `Stock: **${status.stockAvailableCount ?? '?'}/${status.selectedTypeCount}** selected in stock\nDaily remaining: **${status.remainingGenerations ?? 'unknown'}**\nLast refresh: ${status.lastStockCheckAt ? `<t:${Math.floor(status.lastStockCheckAt / 1000)}:R>` : '—'}`,
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
