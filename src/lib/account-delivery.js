import { PermissionFlagsBits } from 'discord.js';
import { getDelivery, getDeliveryChannelForType } from './settings.js';
import {
  logDirectMessageError,
  sendDirectMessage,
} from './delivery.js';
import { CREDENTIAL_DELETE_AFTER_MS } from '../config.js';
import { buildAccountPayload } from './ui.js';
import {
  enqueueDelivery,
  isDelivered,
  markDelivered,
} from './delivery-queue.js';

async function resolveChannel(client, guildId, fallbackChannel, type) {
  const configuredId = getDeliveryChannelForType(guildId, type);
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

function deleteLater(message) {
  if (!message || !CREDENTIAL_DELETE_AFTER_MS) return;
  setTimeout(() => message.delete().catch(() => {}), CREDENTIAL_DELETE_AFTER_MS).unref?.();
}

// Validate destinations before calling BloxGen. A failed Discord delivery
// should not consume an account that the user never receives.
export async function ensureDeliveryReady({ client, guildId, fallbackChannel, user, type }) {
  const mode = getDelivery(guildId);

  if (mode === 'dm' || mode === 'both') {
    await user.createDM();
  }

  if (mode === 'server' || mode === 'both') {
    const channel = await resolveChannel(client, guildId, fallbackChannel, type);
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
  type,
  payload,
  account = null,
  voice = null,
  ownerId = user?.id,
  context = 'account delivery',
}) {
  const mode = getDelivery(guildId);
  const result = {
    mode,
    channelSent: false,
    dmSent: false,
    channelError: null,
    dmError: null,
    channelId: getDeliveryChannelForType(guildId, type),
  };

  if (mode === 'server' || mode === 'both') {
    try {
      const channel = await resolveChannel(client, guildId, fallbackChannel, type);
      result.channelId = channel.id;
      const item = {
        guildId,
        type,
        ownerId,
        destination: 'channel',
        channelId: channel.id,
        account,
      };
      if (isDelivered(item)) {
        result.channelSent = true;
      } else {
        const channelPayload = account
          ? buildAccountPayload(account, { ownerId, voice, includeCredentials: false, destination: `<#${channel.id}>` })
          : payload;
        const message = await channel.send(channelPayload);
        markDelivered(item);
        deleteLater(message);
        result.channelSent = true;
      }
    } catch (error) {
      result.channelError = error;
      if (account) {
        enqueueDelivery({
          guildId,
          type,
          ownerId,
          destination: 'channel',
          channelId: result.channelId,
          account,
        });
      }
    }
  }

  if (mode === 'dm' || mode === 'both') {
    try {
      const item = {
        guildId,
        type,
        ownerId,
        destination: 'dm',
        account,
      };
      if (!isDelivered(item)) {
        const dmPayload = account
          ? buildAccountPayload(account, { ownerId, voice, includeCredentials: true, destination: 'Private DM' })
          : payload;
        const dmChannel = await user.createDM();
        const message = await dmChannel.send(dmPayload);
        markDelivered(item);
        deleteLater(message);
      }
      result.dmSent = true;
    } catch (error) {
      result.dmError = error;
      logDirectMessageError(context, user, error);
      if (account) {
        enqueueDelivery({
          guildId,
          type,
          ownerId,
          destination: 'dm',
          account,
        });
      }
    }
  }

  if (!result.channelSent && !result.dmSent) {
    const error = result.channelError || result.dmError || new Error('No delivery destination succeeded.');
    error.deliveryResult = result;
    throw error;
  }

  return result;
}