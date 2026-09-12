import { ACCOUNT_TYPES, getStock } from '../bloxgen.js';
import { generateAccount } from './generation.js';
import { getDelivery } from './settings.js';
import { deliverAccount } from './account-delivery.js';
import { logDirectMessageError } from './delivery.js';
import { getUserApiKey } from './api-keys.js';

export const AUTO_GENERATION_INTERVAL_MS = 5 * 1000;
export const AUTO_GENERATION_DURATION_MS = 24 * 60 * 60 * 1000;
export const AUTO_GENERATION_TYPES = [...ACCOUNT_TYPES];
const DEFAULT_AUTO_GENERATION_TYPES = [...AUTO_GENERATION_TYPES];

const selectedTypes = new Map();
const activeRuns = new Map();

function isInStock(value) {
  return value === true || value?.available === true;
}

function normalizeTypes(types) {
  const unique = [...new Set(types)].filter((type) => AUTO_GENERATION_TYPES.includes(type));
  return unique.length ? unique : DEFAULT_AUTO_GENERATION_TYPES;
}

export function getAutoGenerationTypes(guildId) {
  return selectedTypes.get(guildId) ?? DEFAULT_AUTO_GENERATION_TYPES;
}

export function setAutoGenerationTypes(guildId, types) {
  if (activeRuns.has(guildId)) return false;
  selectedTypes.set(guildId, normalizeTypes(types));
  return true;
}

export function getAutoGenerationStatus(guildId) {
  const run = activeRuns.get(guildId);
  if (!run) {
    return {
      enabled: false,
      types: getAutoGenerationTypes(guildId),
      intervalMs: AUTO_GENERATION_INTERVAL_MS,
      endsAt: null,
    };
  }

  return {
    enabled: true,
    types: run.types,
    intervalMs: run.intervalMs,
    endsAt: run.endsAt,
  };
}

async function deliverGeneratedAccount(client, run, payload, user) {
  const fallbackChannel = ['server', 'both'].includes(getDelivery(run.guildId))
    ? await client.channels.fetch(run.channelId)
    : null;
  return deliverAccount({
    client,
    guildId: run.guildId,
    fallbackChannel,
    user,
    payload,
    context: 'auto-generation',
  });
}

async function generateNext(client, run) {
  if (run.generating || activeRuns.get(run.guildId) !== run) return;
  if (Date.now() < run.cooldownUntil) return;
  run.generating = true;

  try {
    // Fail closed when the stock endpoint is unavailable so auto-generation
    // never blindly spends balance while the inventory is unknown.
    const apiKey = getUserApiKey(run.userId);
    const stock = await getStock(apiKey);
    const availableTypes = run.types.filter((type) => isInStock(stock?.[type]));
    if (!availableTypes.length) {
      console.log(`Auto-generation skipped for guild ${run.guildId}: no selected types in stock.`);
      return;
    }

    const type = availableTypes[run.nextTypeIndex % availableTypes.length];
    run.nextTypeIndex += 1;
    const user = await client.users.fetch(run.userId);
    const payload = await generateAccount(client, {
      type,
      user,
      guildId: run.guildId,
      apiKey,
    });
    const delivery = await deliverGeneratedAccount(client, run, payload, user);
    if (delivery.mode === 'both' && (delivery.channelError || delivery.dmError)) {
      if (delivery.dmError) logDirectMessageError('auto-generation', user, delivery.dmError);
      await disableAutoGeneration(run.guildId, { refresh: true });
      console.error(`Auto-generation stopped for guild ${run.guildId}: one of the required delivery destinations failed.`);
      return;
    }
    console.log(`Auto-generated ${type} for guild ${run.guildId}.`);
  } catch (err) {
    if (err.deliveryResult?.channelError) {
      await disableAutoGeneration(run.guildId, { refresh: true });
      console.error(
        `Auto-generation stopped for guild ${run.guildId}: channel delivery failed:`,
        err.deliveryResult.channelError.message,
      );
      return;
    }

    if (getDelivery(run.guildId) !== 'server' && err?.code === 50007) {
      // Do not keep generating paid accounts when Discord will not deliver
      // them. The admin can enable the run again after fixing DM privacy.
      await disableAutoGeneration(run.guildId, { refresh: true });
      console.error(
        `Auto-generation stopped for guild ${run.guildId}: DMs are blocked for the account recipient.`,
      );
      return;
    }

    const messageSeconds = Number(err.message?.match(/wait\s+(\d+)\s*second/i)?.[1]) || 0;
    const rawTimeRemaining = Number(err.timeRemaining) || 0;
    // BloxGen's timeRemaining is returned in milliseconds, while some error
    // messages report whole seconds. Prefer the readable message and convert
    // the raw value so a 3579ms cooldown is not treated as 3579 seconds.
    const seconds = messageSeconds ||
      (rawTimeRemaining >= 1000 ? Math.ceil(rawTimeRemaining / 1000) : rawTimeRemaining);
    if (seconds > 0) {
      run.cooldownUntil = Date.now() + seconds * 1000;
      console.log(`Auto-generation paused for ${seconds}s due to the BloxGen cooldown.`);
    }
    console.error(`Auto-generation failed for guild ${run.guildId}:`, err.message);
  } finally {
    run.generating = false;
  }
}

export async function disableAutoGeneration(guildId, { refresh = false } = {}) {
  const run = activeRuns.get(guildId);
  if (!run) return false;

  clearInterval(run.interval);
  clearTimeout(run.timeout);
  activeRuns.delete(guildId);

  if (refresh) {
    await run.refresh?.().catch((err) => {
      console.error('Failed to refresh the auto-generation panel:', err.message);
    });
  }
  return true;
}

export function enableAutoGeneration(client, {
  guildId,
  userId,
  channelId,
  controlMessage,
}) {
  if (activeRuns.has(guildId)) return false;

  const types = getAutoGenerationTypes(guildId);
  const run = {
    guildId,
    userId,
    channelId,
    controlMessage,
    types,
    intervalMs: AUTO_GENERATION_INTERVAL_MS,
    endsAt: Date.now() + AUTO_GENERATION_DURATION_MS,
    nextTypeIndex: 0,
    generating: false,
    cooldownUntil: 0,
    interval: null,
    timeout: null,
    refresh: null,
  };

  run.interval = setInterval(() => {
    void generateNext(client, run);
  }, run.intervalMs);

  run.timeout = setTimeout(() => {
    void disableAutoGeneration(guildId, { refresh: true });
  }, AUTO_GENERATION_DURATION_MS);

  activeRuns.set(guildId, run);

  // Generate once immediately, then continue every 5 seconds.
  void generateNext(client, run);
  return true;
}

export function setAutoGenerationRefresh(guildId, refresh) {
  const run = activeRuns.get(guildId);
  if (run) run.refresh = refresh;
}