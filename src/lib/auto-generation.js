import {
  ACCOUNT_TYPES,
  canGenerateType,
  getDailyLimit,
  getStock,
} from '../bloxgen.js';
import { generateAccount } from './generation.js';
import { getDelivery } from './settings.js';
import { deliverAccount } from './account-delivery.js';
import { logDirectMessageError } from './delivery.js';

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
      generatedCount: 0,
      skippedCount: 0,
      attemptCount: 0,
      pausedReason: null,
      lastType: null,
      lastGeneratedAt: null,
      lastStockCheckAt: null,
      lastLimitCheckAt: null,
    };
  }

  return {
    enabled: true,
    types: run.types,
    intervalMs: run.intervalMs,
    endsAt: run.endsAt,
    generatedCount: run.generatedCount,
    skippedCount: run.skippedCount,
    attemptCount: run.attemptCount,
    pausedReason: run.pausedReason,
    lastType: run.lastType,
    lastGeneratedAt: run.lastGeneratedAt,
    lastStockCheckAt: run.lastStockCheckAt,
    lastLimitCheckAt: run.lastLimitCheckAt,
  };
}

async function deliverGeneratedAccount(client, run, payload, user) {
  const fallbackChannel = ['server', 'both'].includes(getDelivery(run.guildId))
    ? await client.channels.fetch(run.channelId).catch(() => null)
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

function refreshPanel(run) {
  if (!run.refresh || run.refreshing) return;
  run.refreshing = true;
  Promise.resolve(run.refresh())
    .catch((err) => console.error('Failed to refresh the auto-generation panel:', err.message))
    .finally(() => {
      run.refreshing = false;
    });
}

async function generateNext(client, run) {
  if (run.generating || activeRuns.get(run.guildId) !== run) return;
  if (Date.now() < run.cooldownUntil) return;
  run.generating = true;
  run.attemptCount++;

  try {
    // Both checks happen immediately before every paid generation. A type at
    // its limit is skipped and the next stocked type is tried instead.
    const [stock, limits] = await Promise.all([getStock(), getDailyLimit()]);
    run.lastStockCheckAt = Date.now();
    run.lastLimitCheckAt = Date.now();

    const stockedTypes = run.types.filter((type) => isInStock(stock?.[type]));
    const availableTypes = stockedTypes.filter((type) => canGenerateType(limits, type));

    if (!stockedTypes.length) {
      run.pausedReason = 'No selected account types are in stock. Checking again automatically for restock.';
      run.skippedCount++;
      console.log(`Auto-generation paused for guild ${run.guildId}: no selected types in stock.`);
      refreshPanel(run);
      return;
    }

    if (!availableTypes.length) {
      run.pausedReason = 'All stocked selected types are at their daily limit. Checking again for the next reset.';
      run.skippedCount++;
      console.log(`Auto-generation paused for guild ${run.guildId}: selected types reached their daily limit.`);
      refreshPanel(run);
      return;
    }

    run.pausedReason = null;
    const type = availableTypes[run.nextTypeIndex % availableTypes.length];
    run.nextTypeIndex++;
    const user = await client.users.fetch(run.userId);
    const payload = await generateAccount(client, {
      type,
      user,
      guildId: run.guildId,
      fallbackChannel: await client.channels.fetch(run.channelId).catch(() => null),
      preflight: { stock, limits },
    });
    const delivery = await deliverGeneratedAccount(client, run, payload, user);

    if (delivery.mode === 'both' && (delivery.channelError || delivery.dmError)) {
      if (delivery.dmError) logDirectMessageError('auto-generation', user, delivery.dmError);
      await disableAutoGeneration(run.guildId, { refresh: true });
      console.error(`Auto-generation stopped for guild ${run.guildId}: one of the required delivery destinations failed.`);
      return;
    }

    run.generatedCount++;
    run.lastType = type;
    run.lastGeneratedAt = Date.now();
    run.lastError = null;
    console.log(`Auto-generated ${type} for guild ${run.guildId}.`);
    refreshPanel(run);
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
      await disableAutoGeneration(run.guildId, { refresh: true });
      console.error(`Auto-generation stopped for guild ${run.guildId}: DMs are blocked for the account recipient.`);
      return;
    }

    const messageSeconds = Number(err.message?.match(/wait\s+(\d+)\s*second/i)?.[1]) || 0;
    const rawTimeRemaining = Number(err.timeRemaining) || 0;
    const seconds = messageSeconds ||
      (rawTimeRemaining >= 1000 ? Math.ceil(rawTimeRemaining / 1000) : rawTimeRemaining);
    if (seconds > 0) {
      run.cooldownUntil = Date.now() + seconds * 1000;
    }

    run.pausedReason = err.isDailyLimit
      ? `BloxGen rejected \`${err.accountType || run.lastType || 'the selected type'}\` because its daily limit was reached.`
      : err.message;
    run.skippedCount++;
    console.error(`Auto-generation failed for guild ${run.guildId}:`, err.message);
    refreshPanel(run);
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
    generatedCount: 0,
    skippedCount: 0,
    attemptCount: 0,
    lastType: null,
    lastGeneratedAt: null,
    lastStockCheckAt: null,
    lastLimitCheckAt: null,
    lastError: null,
    pausedReason: null,
    refreshing: false,
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