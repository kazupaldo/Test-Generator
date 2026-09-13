// Per-server settings, cached in memory and persisted to settings.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../config.js';

const FILE = join(ROOT, 'settings.json');

// Load once at startup; reads then hit memory, writes go through to disk.
let cache;
try {
  cache = JSON.parse(readFileSync(FILE, 'utf8'));
} catch {
  cache = {};
}

function update(guildId, patch) {
  cache[guildId] = { ...cache[guildId], ...patch };
  try {
    writeFileSync(FILE, JSON.stringify(cache, null, 2));
  } catch (err) {
    console.error('Failed to save settings:', err.message);
  }
}

// Where generated accounts are sent: "dm" (default), "server", or "both".
export function getDelivery(guildId) {
  if (!guildId) return 'dm';
  return cache[guildId]?.delivery ?? 'dm';
}

// Optional channel selected for server/both delivery.
export function getDeliveryChannel(guildId) {
  if (!guildId) return null;
  return cache[guildId]?.deliveryChannel ?? null;
}

export function getDeliveryChannelForType(guildId, type) {
  if (!guildId || !type) return getDeliveryChannel(guildId);
  return cache[guildId]?.deliveryChannels?.[type] ?? getDeliveryChannel(guildId);
}

export function getDeliveryChannelsByType(guildId) {
  if (!guildId) return {};
  return { ...(cache[guildId]?.deliveryChannels ?? {}) };
}

export function setDelivery(guildId, delivery, channelId) {
  const patch = { delivery };
  if (channelId !== undefined) patch.deliveryChannel = channelId || null;
  update(guildId, patch);
}

export function setDeliveryChannelForType(guildId, type, channelId) {
  if (!guildId || !type) return;
  const deliveryChannels = { ...(cache[guildId]?.deliveryChannels ?? {}) };
  if (channelId) deliveryChannels[type] = channelId;
  else delete deliveryChannels[type];
  update(guildId, { deliveryChannels });
}

export function getAutoGenerationConfig(guildId) {
  if (!guildId) return {};
  return { ...(cache[guildId]?.autoGeneration ?? {}) };
}

export function setAutoGenerationConfig(guildId, patch) {
  if (!guildId) return;
  update(guildId, {
    autoGeneration: {
      ...(cache[guildId]?.autoGeneration ?? {}),
      ...patch,
    },
  });
}

export function getConfiguredGuildIds() {
  return Object.keys(cache);
}

// Channel ID where generations are logged for this server (null = none set).
export function getLogChannel(guildId) {
  if (!guildId) return null;
  return cache[guildId]?.logChannel ?? null;
}

// Pass null/undefined to clear the configured log channel.
export function setLogChannel(guildId, channelId) {
  update(guildId, { logChannel: channelId ?? null });
}
