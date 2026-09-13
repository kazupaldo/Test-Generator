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
export const AUTO_PANEL_REFRESH_INTERVAL_MS = 15 * 1000;
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

function countStockedTypes(types, stock) {
  return types.filter((type) => isInStock(stock?.[type])).length;
}

function parseResetTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const timestamp = numeric < 1e12 ? numeric * 1000 : numeric;
    return timestamp > Date.now() ? timestamp : null;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) || timestamp <= Date.now() ? null : timestamp;
}

function hasExplicitAvailableLimit(limits, type) {
  const typeLimit = limits?.accountTypes?.find(
    (item) => String(item.accountType).trim().toLowerCase() === type.trim().toLowerCase(),
  );
  if (typeLimit) {
    return typeLimit.canGenerate === true &&
      (typeLimit.remainingGenerations === null || typeLimit.remainingGenerations > 0);
  }
  return limits?.remainingGenerations !== null &&
    limits?.remainingGenerations > 0 &&
    limits?.canGenerate === true;
}

function clearRecoveredLimitBlocks(run, limits) {
  for (const [type, blockedUntil] of run.limitBlockedTypes) {
    if (
      hasExplicitAvailableLimit(limits, type) ||
      (blockedUntil !== Number.POSITIVE_INFINITY && blockedUntil <= Date.now())
    ) {
      run.limitBlockedTypes.delete(type);
    }
  }
}

function blockLimitedTypes(run, types, limits) {
  const blockedUntil = parseResetTime(limits?.resetTime) ?? Number.POSITIVE_INFINITY;
  for (const type of types) run.limitBlockedTypes.set(type, blockedUntil);
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
      waitingReason: null,
      lastType: null,
      lastGeneratedAt: null,
      lastStockCheckAt: null,
      lastLimitCheckAt: null,
      selectedTypeCount: getAutoGenerationTypes(guildId).length,
      stockAvailableCount: null,
      remainingGenerations: null,
      limitBlockedTypes: [],
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
    waitingReason: run.waitingReason,
    lastType: run.lastType,
    lastGeneratedAt: run.lastGeneratedAt,
    lastStockCheckAt: run.lastStockCheckAt,
    lastLimitCheckAt: run.lastLimitCheckAt,
    selectedTypeCount: run.types.length,
    stockAvailableCount: run.stock ? countStockedTypes(run.types, run.stock) : null,
    remainingGenerations: run.limits?.remainingGenerations ?? null,
    limitBlockedTypes: [...run.limitBlockedTypes.keys()],
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

function refreshPanel(run, force = false) {
  if (!run.refresh || run.refreshing) return;
  if (!force && Date.now() - run.lastPanelRefreshAt < AUTO_PANEL_REFRESH_INTERVAL_MS) return;
  run.lastPanelRefreshAt = Date.now();
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
  let attemptedType = null;

  try {
    // Both checks happen immediately before every paid generation. A type at
    // its limit is skipped and the next stocked type is tried instead.
    const [stock, limits] = await Promise.all([getStock(), getDailyLimit()]);
    run.stock = stock;
    run.limits = limits;
    run.lastStockCheckAt = Date.now();
    run.lastLimitCheckAt = run.lastStockCheckAt;
    clearRecoveredLimitBlocks(run, limits);
    refreshPanel(run);

    const stockedTypes = run.types.filter((type) => isInStock(stock?.[type]));
    const availableTypes = stockedTypes.filter(
      (type) => canGenerateType(limits, type) && !run.limitBlockedTypes.has(type),
    );

    if (!stockedTypes.length) {
      run.waitingReason = 'No selected account types are in stock.';
      run.skippedCount++;
      console.log(`Auto-generation is waiting for stock in guild ${run.guildId}; it will retry on the next 5-second cycle.`);
      refreshPanel(run, true);
      return;
    }

    if (!availableTypes.length) {
      run.waitingReason = 'All stocked selected types are at their daily limit.';
      run.skippedCount++;
      console.log(`Auto-generation is waiting for a daily-limit reset in guild ${run.guildId}; it will retry on the next 5-second cycle.`);
      refreshPanel(run, true);
      return;
    }

    run.waitingReason = null;
    const type = availableTypes[run.nextTypeIndex % availableTypes.length];
    attemptedType = type;
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
    refreshPanel(run, true);
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
    if (seconds > 0 && !err.isDailyLimit) {
      run.cooldownUntil = Date.now() + seconds * 1000;
    }

    if (err.isDailyLimit) {
      const matchingType = err.accountType
        ? run.types.find(
          (type) => type.trim().toLowerCase() === String(err.accountType).trim().toLowerCase(),
        )
        : null;
      const limitedTypes = matchingType
        ? [matchingType]
        : err.accountType
          ? [attemptedType].filter(Boolean)
          : run.types;
      blockLimitedTypes(run, limitedTypes, run.limits);
    }

    run.waitingReason = err.isDailyLimit
      ? `\`${err.accountType || attemptedType || run.lastType || 'the selected type'}\` is at its daily limit; it will not be retried until the limit resets.`
      : err.message;
    run.lastError = err.message;
    run.skippedCount++;
    console.error(`Auto-generation failed for guild ${run.guildId}:`, err.message);
    refreshPanel(run, true);
  } finally {
    run.generating = false;
  }
}

export async function disableAutoGeneration(guildId, { refresh = false } = {}) {
  const run = activeRuns.get(guildId);
  if (!run) return false;

  clearInterval(run.interval);
  clearInterval(run.panelInterval);
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
    endsAt: null,
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
    waitingReason: null,
    refreshing: false,
    lastPanelRefreshAt: 0,
    stock: null,
    limits: null,
    limitBlockedTypes: new Map(),
    interval: null,
    panelInterval: null,
    refresh: null,
  };

  run.interval = setInterval(() => {
    void generateNext(client, run);
  }, run.intervalMs);
  run.panelInterval = setInterval(() => refreshPanel(run, true), AUTO_PANEL_REFRESH_INTERVAL_MS);

  activeRuns.set(guildId, run);

  // Generate once immediately, then continue every 5 seconds until disabled.
  void generateNext(client, run);
  return true;
}

export function setAutoGenerationRefresh(guildId, refresh) {
  const run = activeRuns.get(guildId);
  if (run) run.refresh = refresh;
}