import {
  ActionRowBuilder,
  ModalBuilder,
  MessageFlags,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { ACCOUNT_TYPES, getStock } from '../bloxgen.js';
import { findAccountByUsername } from '../bloxgen-dashboard.js';
import { generateAccount } from '../lib/generation.js';
import { changePassword } from '../roblox.js';
import {
  disableAutoGeneration,
  enableAutoGeneration,
  getAutoGenerationStatus,
  setAutoGenerationRefresh,
  setAutoGenerationTypes,
} from '../lib/auto-generation.js';
import {
  accountActionsRow,
  buildAccountPayload,
  buildAutoGenerationPanel,
} from '../lib/ui.js';
import { buildHistoryPage } from '../commands/history.js';
import { buildApiKeyModal } from '../commands/key.js';
import { commands } from '../commands/index.js';
import { buildStockReply } from '../commands/stock.js';
import { describeDirectMessageError, sendDirectMessage } from '../lib/delivery.js';
import { deliverAccount } from '../lib/account-delivery.js';
import {
  getUserApiKey,
  listUserApiKeys,
  removeUserApiKey,
  setUserApiKey,
} from '../lib/api-keys.js';
import { recordGeneration } from '../lib/statistics.js';

// Generate from a button/menu interaction. The account is sent to DMs (or the
// channel) so it persists; the interaction reply is just an ephemeral receipt.
async function handleGenerateInteraction(interaction, type) {
  if (!ACCOUNT_TYPES.includes(type)) {
    await interaction.reply({ content: '❌ Unknown account type.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const payload = await generateAccount(interaction.client, {
      type,
      user: interaction.user,
      guildId: interaction.guildId,
      fallbackChannel: interaction.channel,
    });
    recordGeneration(interaction.guildId, type, 'generated');

    try {
      const result = await deliverAccount({
        client: interaction.client,
        guildId: interaction.guildId,
        fallbackChannel: interaction.channel,
        user: interaction.user,
        type,
        payload,
        account: payload.account,
        voice: payload.voice,
        ownerId: interaction.user.id,
        context: 'interactive account picker',
      });
      recordGeneration(interaction.guildId, type, result.channelSent || result.dmSent ? 'successful' : 'failed',
        result.channelSent ? result.channelId : null);
      if (result.mode === 'both') {
        if (result.dmError) {
          await interaction.editReply(
            `⚠️ Account posted in <#${result.channelId}> but the DM failed: ${describeDirectMessageError(result.dmError)}`,
          );
        } else if (result.channelError) {
          await interaction.editReply(
            `⚠️ Account sent to your DMs, but the channel delivery failed: ${result.channelError.message}`,
          );
        } else {
          await interaction.editReply(`✅ Account sent to your DMs and posted in <#${result.channelId}>.`);
        }
      } else if (result.mode === 'server') {
        await interaction.editReply(`✅ Account posted in <#${result.channelId}>.`);
      } else {
        await interaction.editReply('📩 Account sent to your DMs.');
      }
    } catch (err) {
      recordGeneration(interaction.guildId, type, 'failed');
      if (err.deliveryResult?.dmError) {
        await interaction.editReply(`❌ ${describeDirectMessageError(err.deliveryResult.dmError)}`);
      } else {
        await interaction.editReply(`❌ ${err.message || 'Could not deliver the generated account.'}`);
      }
    }
  } catch (err) {
    console.error('Interaction generate failed:', err);
    await interaction.editReply(`❌ ${err.message || 'Something went wrong.'}`);
  }
}

function parsePasswordChangeId(customId, prefix) {
  const value = customId.slice(prefix.length);
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const ownerId = value.slice(0, separator);
  const encodedUsername = value.slice(separator + 1);
  if (!encodedUsername) return null;
  try {
    return { ownerId, username: decodeURIComponent(encodedUsername) };
  } catch {
    return null;
  }
}

function buildPasswordChangeModal(ownerId, username) {
  return new ModalBuilder()
    .setCustomId(`password-change-modal:${ownerId}:${encodeURIComponent(username)}`)
    .setTitle('Change Roblox password')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('current-password')
          .setLabel('Current password')
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('new-password')
          .setLabel('New password')
          .setStyle(TextInputStyle.Short)
          .setMinLength(8)
          .setMaxLength(72)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('confirm-password')
          .setLabel('Confirm new password')
          .setStyle(TextInputStyle.Short)
          .setMinLength(8)
          .setMaxLength(72)
          .setRequired(true),
      ),
    );
}

async function handlePasswordChange(interaction, parsed) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const currentPassword = interaction.fields.getTextInputValue('current-password');
  const newPassword = interaction.fields.getTextInputValue('new-password');
  const confirmation = interaction.fields.getTextInputValue('confirm-password');
  if (newPassword !== confirmation) {
    await interaction.editReply('❌ The new password and confirmation do not match.');
    return;
  }

  try {
    const account = await findAccountByUsername(parsed.username);
    if (!account) {
      await interaction.editReply(`❌ No generated account found for \`${parsed.username}\`.`);
      return;
    }
    if (!account.cookie) {
      await interaction.editReply('❌ This account does not have a Roblox session cookie, so its password cannot be changed.');
      return;
    }

    await changePassword({
      cookie: account.cookie,
      currentPassword,
      newPassword,
    });

    const updatedAccount = { ...account, password: newPassword };
    try {
      await sendDirectMessage(interaction.user, buildAccountPayload(updatedAccount, {
        ownerId: interaction.user.id,
        includeCredentials: true,
        destination: 'Private DM',
      }));
      await interaction.editReply('✅ Password changed. I sent the updated account details to your DMs.');
    } catch (err) {
      await interaction.editReply(
        `✅ Password changed, but I could not send the updated details by DM (${describeDirectMessageError(err)}).`,
      );
    }
  } catch (err) {
    await interaction.editReply(`❌ ${err.message || 'Could not change the password.'}`);
  }
}

async function handleShowLogin(interaction, parsed) {
  if (interaction.user.id !== parsed.ownerId) {
    await interaction.reply({
      content: '❌ Only the account recipient can view these credentials.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const account = await findAccountByUsername(parsed.username);
    if (!account) {
      await interaction.editReply(`❌ No generated account found for \`${parsed.username}\`.`);
      return;
    }
    await sendDirectMessage(interaction.user, buildAccountPayload(account, {
      ownerId: interaction.user.id,
      includeCredentials: true,
      destination: 'Private DM',
    }));
    await interaction.editReply('📩 I sent the login details to your DMs.');
  } catch (error) {
    await interaction.editReply(`❌ ${error.message || 'Could not send the login details.'}`);
  }
}

export const name = 'interactionCreate';

function createMessageAdapter(interaction, options) {
  const selectedChannel = options.getChannel('channel');
  return {
    author: interaction.user,
    guildId: interaction.guildId,
    guild: interaction.guild,
    member: interaction.member,
    channel: interaction.channel,
    mentions: {
      channels: {
        first: () => selectedChannel,
      },
    },
  };
}

async function handleChatInputCommand(interaction, client) {
  const command = commands.get(interaction.commandName);
  if (!command) return;

  const options = interaction.options;
  const message = createMessageAdapter(interaction, options);
  let args = [];

  switch (interaction.commandName) {
    case 'generate': {
      const type = options.getString('type');
      if (type) args = [type];
      break;
    }
    case 'followers':
      args = [options.getString('account')];
      break;
    case 'secure':
      if (options.getString('type')) {
        args = ['type', options.getString('type')];
      } else if (options.getString('account')) {
        args = [options.getString('account')];
      }
      break;
    case 'settings': {
      const type = options.getString('type');
      const typeChannel = options.getChannel('type_channel');
      if (type) {
        args = ['type-route', type, typeChannel?.id || ''];
        break;
      }
      const mode = options.getString('mode');
      if (mode) args = [mode];
      const channel = options.getChannel('channel');
      if (channel) args.push(channel.id);
      break;
    }
    case 'logs': {
      const action = options.getString('action');
      const channel = options.getChannel('channel');
      if (action === 'channel' && channel) {
        args = [channel.id];
      } else if (action) {
        args = [action];
      } else if (channel) {
        args = [channel.id];
      }
      break;
    }
    case 'history': {
      const action = options.getString('action');
      const query = options.getString('query');
      if (action === 'export') {
        args = [
          'export',
          options.getString('type') || 'all',
          ...(options.getInteger('page') ? [String(options.getInteger('page'))] : []),
          options.getString('format') || 'txt',
        ];
      } else if (query) {
        args = [query];
      }
      break;
    }
  }

  await interaction.deferReply();
  try {
    const reply = await command.execute({ message, args, client, interaction });
    if (reply) {
      await interaction.editReply(reply);
    } else {
      // `generate` in channel-delivery mode sends the account directly to the
      // channel, so the interaction still needs a small acknowledgement.
      await interaction.editReply('✅ Done.');
    }
  } catch (err) {
    console.error(`/${interaction.commandName} failed:`, err);
    await interaction.editReply(`❌ ${err.message || 'Something went wrong.'}`);
  }
}

export async function execute(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction, interaction.client);
    } else if (interaction.isButton() && interaction.customId === 'api-key-add') {
      await interaction.showModal(buildApiKeyModal());
    } else if (interaction.isButton() && interaction.customId === 'api-key-status') {
      const keys = listUserApiKeys(interaction.user.id);
      await interaction.reply({
        content: keys.names.length
          ? `🔐 Saved key names: ${keys.names.map((name) => `\`${name}\``).join(', ')}\nActive key: \`${keys.active}\``
          : '🔐 No personal API keys saved yet.',
        flags: MessageFlags.Ephemeral,
      });
    } else if (interaction.isButton() && interaction.customId === 'api-key-remove') {
      const removed = removeUserApiKey(interaction.user.id);
      await interaction.reply({
        content: removed ? '✅ Your active personal API key was removed.' : '📭 You do not have a saved personal API key.',
        flags: MessageFlags.Ephemeral,
      });
    } else if (interaction.isModalSubmit() && interaction.customId === 'api-key-submit') {
      const value = interaction.fields.getTextInputValue('api-key-value').trim();
      const name = interaction.fields.getTextInputValue('api-key-name').trim() || 'default';
      try {
        const savedName = setUserApiKey(interaction.user.id, value, name);
        await interaction.reply({
          content: `✅ Personal BloxGen API key \`${savedName}\` saved securely. It will be used for your commands and auto-generation.`,
          flags: MessageFlags.Ephemeral,
        });
      } catch (error) {
        await interaction.reply({ content: `❌ ${error.message}`, flags: MessageFlags.Ephemeral });
      }
    } else if (interaction.isButton() && interaction.customId.startsWith('account-login:')) {
      const parsed = parsePasswordChangeId(interaction.customId, 'account-login:');
      if (!parsed) {
        await interaction.reply({ content: '❌ Invalid login button.', flags: MessageFlags.Ephemeral });
        return;
      }
      await handleShowLogin(interaction, parsed);
    } else if (interaction.isButton() && interaction.customId.startsWith('password-change:')) {
      const parsed = parsePasswordChangeId(interaction.customId, 'password-change:');
      if (!parsed) {
        await interaction.reply({ content: '❌ Invalid password-change button.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (interaction.user.id !== parsed.ownerId) {
        await interaction.reply({ content: '❌ Only the account recipient can change this password.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.showModal(buildPasswordChangeModal(parsed.ownerId, parsed.username));
    } else if (interaction.isModalSubmit() && interaction.customId.startsWith('password-change-modal:')) {
      const parsed = parsePasswordChangeId(interaction.customId, 'password-change-modal:');
      if (!parsed || interaction.user.id !== parsed.ownerId) {
        await interaction.reply({ content: '❌ You are not authorized to change this password.', flags: MessageFlags.Ephemeral });
        return;
      }
      await handlePasswordChange(interaction, parsed);
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'autogen-types') {
      if (!interaction.guild || !interaction.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: '❌ You need the **Manage Server** permission.', flags: MessageFlags.Ephemeral });
        return;
      }
      if (!setAutoGenerationTypes(interaction.guildId, interaction.values)) {
        await interaction.reply({ content: '❌ Disable auto-generation before changing its categories.', flags: MessageFlags.Ephemeral });
        return;
      }
      await interaction.update(buildAutoGenerationPanel(interaction.guildId));
    } else if (interaction.isButton() && interaction.customId === 'stock-refresh') {
      await interaction.deferUpdate();
      try {
        const data = await getStock(getUserApiKey(interaction.user.id));
        await interaction.editReply(buildStockReply(data));
      } catch (err) {
        console.error('Live stock refresh failed:', err);
        await interaction.editReply({
          content: `❌ ${err.message || 'Could not fetch live stock.'}`,
          embeds: [],
          components: [],
        });
      }
    } else if (interaction.isStringSelectMenu() && interaction.customId === 'gen-select') {
      await handleGenerateInteraction(interaction, interaction.values[0]);
    } else if (interaction.isButton() && interaction.customId.startsWith('gen-again:')) {
      await handleGenerateInteraction(interaction, interaction.customId.slice('gen-again:'.length));
    } else if (interaction.isButton() && ['autogen-enable', 'autogen-disable'].includes(interaction.customId)) {
      if (!interaction.guild || !interaction.member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({ content: '❌ You need the **Manage Server** permission.', flags: MessageFlags.Ephemeral });
        return;
      }

      if (interaction.customId === 'autogen-enable') {
        const started = enableAutoGeneration(interaction.client, {
          guildId: interaction.guildId,
          userId: interaction.user.id,
          channelId: interaction.channelId,
          controlMessage: interaction.message,
        });
        if (!started) {
          await interaction.reply({ content: 'Auto-generation is already enabled for this server.', flags: MessageFlags.Ephemeral });
          return;
        }
        setAutoGenerationRefresh(interaction.guildId, () =>
          interaction.message.edit(buildAutoGenerationPanel(interaction.guildId)),
        );
      } else {
        await disableAutoGeneration(interaction.guildId);
      }
      await interaction.update(buildAutoGenerationPanel(interaction.guildId));
    } else if (interaction.isButton() && interaction.customId.startsWith('hist:')) {
      const page = Math.max(1, parseInt(interaction.customId.slice('hist:'.length), 10) || 1);
      try {
        const payload = await buildHistoryPage(page);
        await interaction.update(payload);
      } catch (err) {
        await interaction.reply({ content: `❌ ${err.message || 'Something went wrong.'}`, flags: MessageFlags.Ephemeral });
      }
    }
  } catch (err) {
    console.error('interactionCreate handler error:', err);
  }
}
