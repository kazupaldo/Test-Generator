import { PermissionFlagsBits } from 'discord.js';
import { getDelivery, getDeliveryChannel } from './settings.js';
import {
  logDirectMessageError,
  sendDirectMessage,
} from './delivery.js';

async function resolveChannel(client, guildId, fallbackChannel) {
  const configuredId = getDeliveryChannel(guildId);
  const channel = configuredId
    ? await client.channels.fetch(configuredId)
    : fallbackChannel;

  if (!channel?.isTextBased()) {
    throw new Error(
      configuredId
        ? `The configured delivery channel <#${configuredId}> is unavailable or is not a text channel.`
        : 'No delivery channel is configured. Run `/settings` with a channel selected.',
    );
  }
  return channel;
}

// Validate destinations before calling BloxGen. A failed Discord delivery
// should not consume an account that the user never receives.
export async function ensureDeliveryReady({ client, guildId, fallbackChannel, user }) {
  const mode = getDelivery(guildId);

  if (mode === 'dm' || mode === 'both') {
    await user.createDM();
  }

  if (mode === 'server' || mode === 'both') {
    const channel = await resolveChannel(client, guildId, fallbackChannel);
    const permissions = channel.permissionsFor?.(client.user);
    if (permissions && !permissions.has(PermissionFlagsBits.SendMessages)) {
      throw new Error(`I cannot send messages in <#${channel.id}>. Give the bot the **Send Messages** permission.`);
    }
    if (permissions && !permissions.has(PermissionFlagsBits.EmbedLinks)) {
      throw new Error(`I cannot send embeds in <#${channel.id}>. Give the bot the **Embed Links** permission.`);
    }
    if (permissions && !permissions.has(PermissionFlagsBits.AttachFiles)) {
      throw new Error(`I cannot attach account details in <#${channel.id}>. Give the bot the **Attach Files** permission.`);
    }
  }
}

// Sends the same generated account to every destination required by the
// server's setting. Each destination is attempted independently so a DM
// failure does not prevent a configured channel from receiving the account.
export async function deliverAccount({
  client,
  guildId,
  fallbackChannel,
  user,
  payload,
  context = 'account delivery',
}) {
  const mode = getDelivery(guildId);
  const result = {
    mode,
    channelSent: false,
    dmSent: false,
    channelError: null,
    dmError: null,
    channelId: getDeliveryChannel(guildId),
  };

  if (mode === 'server' || mode === 'both') {
    try {
      const channel = await resolveChannel(client, guildId, fallbackChannel);
      result.channelId = channel.id;
      await channel.send(payload);
      result.channelSent = true;
    } catch (error) {
      result.channelError = error;
    }
  }

  if (mode === 'dm' || mode === 'both') {
    try {
      await sendDirectMessage(user, payload);
      result.dmSent = true;
    } catch (error) {
      result.dmError = error;
      logDirectMessageError(context, user, error);
    }
  }

  if (!result.channelSent && !result.dmSent) {
    const error = result.channelError || result.dmError || new Error('No delivery destination succeeded.');
    error.deliveryResult = result;
    throw error;
  }

  return result;
}