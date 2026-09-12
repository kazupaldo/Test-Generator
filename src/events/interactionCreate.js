import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { ACCOUNT_TYPES, getBalance, getStock } from '../bloxgen.js';
import { generateAccount } from '../lib/generation.js';
import {
  disableAutoGeneration,
  enableAutoGeneration,
  getAutoGenerationStatus,
  setAutoGenerationRefresh,
  setAutoGenerationTypes,
} from '../lib/auto-generation.js';
import { buildAutoGenerationPanel } from '../lib/ui.js';
import { buildHistoryPage } from '../commands/history.js';
import { commands } from '../commands/index.js';
import { buildApiKeyModal, buildApiKeyPanel } from '../commands/key.js';
import { buildStockReply } from '../commands/stock.js';
import { describeDirectMessageError } from '../lib/delivery.js';
import { deliverAccount } from '../lib/account-delivery.js';
import {
  getUserApiKey,
  hasPersonalApiKey,
  removeUserApiKey,
  setUserApiKey,
} from '../lib/api-keys.js';

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
      apiKey: getUserApiKey(interaction.user.id),
    });

    try {
      const result = await deliverAccount({
        client: interaction.client,
        guildId: interaction.guildId,
        fallbackChannel: interaction.channel,
        user: interaction.user,
        payload,
        context: 'interactive account picker',
      });
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
    case 'settings': {
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
      const query = options.getString('query');
      if (query) args = [query];
      break;
    }
  }

  if (interaction.commandName === 'key') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } else {
    await interaction.deferReply();
  }
  try {
    const reply = await command.execute({
      message,
      args,
      client,
      interaction,
      apiKey: getUserApiKey(interaction.user.id),
    });
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
    if (interaction.isModalSubmit() && interaction.customId === 'api-key-submit') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const apiKey = interaction.fields.getTextInputValue('api-key-value')?.trim();
      if (!apiKey || apiKey.length < 8 || apiKey.length > 256 || /\s/.test(apiKey)) {
        await interaction.editReply('❌ That does not look like a valid API key format.');
        return;
      }

      try {
        const balance = await getBalance(apiKey);
        setUserApiKey(interaction.user.id, apiKey);
        await interaction.editReply(
          `✅ Personal API key saved and validated. Current balance: **$${balance.balance}**.\n` +
          'Future commands and auto-generation started by you will use this key.',
        );
      } catch (err) {
        console.error(`Personal API key validation failed for user ${interaction.user.id}:`, err.message);
        await interaction.editReply('❌ BloxGen rejected that key or is temporarily unavailable. The key was not saved.');
      }
    } else if (interaction.isChatInputCommand()) {
      await handleChatInputCommand(interaction, interaction.client);
    } else if (interaction.isButton() && interaction.customId === 'api-key-add') {
      await interaction.showModal(buildApiKeyModal());
    } else if (interaction.isButton() && interaction.customId === 'api-key-status') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.editReply(
        hasPersonalApiKey(interaction.user.id)
          ? '✅ You have a validated personal API key. Your commands use it instead of the bot default.'
          : 'ℹ️ You are using the bot default API key. Use **Add or replace key** to use your own.',
      );
    } else if (interaction.isButton() && interaction.customId === 'api-key-remove') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const removed = removeUserApiKey(interaction.user.id);
      await interaction.editReply(
        removed
          ? '✅ Your personal API key was removed. Commands now use the bot default key.'
          : 'ℹ️ You did not have a personal API key saved.',
      );
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
