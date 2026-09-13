import {
  ACCOUNT_TYPES,
  canGenerateType,
  getDailyLimit,
  getStock,
} from '../bloxgen.js';
import { generateAccount } from './generation.js';
import { getDelivery } from './settings.js';
import {
  getAutoGenerationConfig,
  getConfiguredGuildIds,
  setAutoGenerationConfig,
} from './settings.js';
import { deliverAccount } from './account-delivery.js';
import { logDirectMessageError } from './delivery.js';
import { requireUserApiKey } from './api-keys.js';
import { recordGeneration } from './statistics.js';
import { drainDeliveryQueue, getPendingDeliveryCount } from './delivery-queue.js';
import { buildAutoGenerationPanel } from './ui.js';

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

function normalizeType(value) {
  return String(value ?? '').trim().toLowerCase();
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

function clearExpiredTypeCooldowns(run) {
  const now = Date.now();
  for (const [type, cooldownUntil] of run.typeCooldowns) {
    if (cooldownUntil <= now) run.typeCooldowns.delete(type);
  }
}

function isTypeCoolingDown(run, type) {
  return (run.typeCooldowns.get(type) ?? 0) > Date.now();
}

export function getAutoGenerationTypes(guildId) {
  return selectedTypes.get(guildId) ??
    normalizeTypes(getAutoGenerationConfig(guildId).types ?? DEFAULT_AUTO_GENERATION_TYPES);
}

export function setAutoGenerationTypes(guildId, types) {
  if (activeRuns.has(guildId)) return false;
  const normalized = normalizeTypes(types);
  selectedTypes.set(guildId, normalized);
  setAutoGenerationConfig(guildId, { types: normalized });
  return true;
}

export function getAutoGenerationInterval(guildId) {
  const interval = Number(getAutoGenerationConfig(guildId).intervalMs);
  return Number.isFinite(interval) ? Math.min(60 * 60_000, Math.max(5_000, interval)) : AUTO_GENERATION_INTERVAL_MS;
}

export function setAutoGenerationInterval(guildId, seconds) {
  if (activeRuns.has(guildId)) return false;
  const intervalMs = Math.min(60 * 60_000, Math.max(5_000, Number(seconds) * 1000));
  if (!Number.isFinite(intervalMs)) return false;
  setAutoGenerationConfig(guildId, { intervalMs });
  return true;
}

export function setAutoGenerationPriority(guildId, types) {
  if (activeRuns.has(guildId)) return false;
  const normalized = normalizeTypes(types);
  selectedTypes.set(guildId, normalized);
  setAutoGenerationConfig(guildId, { types: normalized });
  return true;
}

function typeStatus(run, type) {
  const stockValue = run.stock?.[type];
  if (!run.stock) return { type, icon: '⚪', label: 'Waiting', reason: 'Checking stock' };
  if (!isInStock(stockValue)) return { type, icon: '⚫', label: 'Out of stock', reason: 'Unavailable' };
  if (run.limitBlockedTypes.has(type) || !canGenerateType(run.limits, type)) {
    return { type, icon: '🔴', label: 'Daily limit reached', reason: 'Try after reset' };
  }
  if (isTypeCoolingDown(run, type)) {
    const remaining = Math.max(1, Math.ceil((run.typeCooldowns.get(type) - Date.now()) / 60_000));
    return { type, icon: '🟡', label: `Cooldown: ${remaining}m`, reason: 'Other types can continue' };
  }
  return { type, icon: '🟢', label: 'In stock', reason: 'Ready' };
}

export function getAutoGenerationStatus(guildId) {
  const run = activeRuns.get(guildId);
  if (!run) {
    return {
      enabled: false,
      types: getAutoGenerationTypes(guildId),
      intervalMs: getAutoGenerationInterval(guildId),
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
      cooldownTypes: [],
      generatedByType: {},
      typeStatuses: getAutoGenerationTypes(guildId).map((type) => ({ type, icon: '⚪', label: 'Waiting', reason: 'Not checked yet' })),
      pendingDeliveries: getPendingDeliveryCount(guildId),
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
    cooldownTypes: [...run.typeCooldowns.keys()],
    generatedByType: { ...run.generatedByType },
    typeStatuses: run.types.map((type) => typeStatus(run, type)),
    pendingDeliveries: getPendingDeliveryCount(guildId),
  };
}

async function deliverGeneratedAccount(client, run, payload, user, type) {
  const fallbackChannel = ['server', 'both'].includes(getDelivery(run.guildId))
    ? await client.channels.fetch(run.channelId).catch(() => null)
    : null;
  return deliverAccount({
    client,
    guildId: run.guildId,
    fallbackChannel,
    user,
    type,
    payload,
    account: payload.account,
    voice: payload.voice,
    ownerId: run.userId,
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

async function sendHealthAlert(client, run, reason) {
  if (run.lastAlertReason === reason) return;
  run.lastAlertReason = reason;
  const channel = await client.channels.fetch(run.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send(`⚠️ **Auto-generation health alert:** ${reason}\nSelected types: ${run.types.join(', ')}`).catch(() => {});
}

async function generateNext(client, run) {
  if (run.generating || activeRuns.get(run.guildId) !== run) return;
  if (Date.now() < run.cooldownUntil) return;
  await drainDeliveryQueue(client, { guildId: run.guildId });
  if (getPendingDeliveryCount(run.guildId) > 0) {
    run.waitingReason = 'Waiting for queued account delivery before generating another account.';
    refreshPanel(run);
    return;
  }
  run.generating = true;
  run.attemptCount++;
  let attemptedType = null;

  try {
    // Both checks happen immediately before every paid generation. A type at
    // its limit is skipped and the next stocked type is tried instead.
    const apiKey = requireUserApiKey(run.userId);
    const [stock, limits] = await Promise.all([getStock(apiKey), getDailyLimit(apiKey)]);
    run.stock = stock;
    run.limits = limits;
    run.lastStockCheckAt = Date.now();
    run.lastLimitCheckAt = run.lastStockCheckAt;
    clearRecoveredLimitBlocks(run, limits);
    clearExpiredTypeCooldowns(run);
    refreshPanel(run);

    const stockedTypes = run.types.filter((type) => isInStock(stock?.[type]));
    const limitAvailableTypes = stockedTypes.filter(
      (type) => canGenerateType(limits, type) && !run.limitBlockedTypes.has(type),
    );
    const availableTypes = limitAvailableTypes.filter(
      (type) => !isTypeCoolingDown(run, type),
    );

    if (!stockedTypes.length) {
      run.waitingReason = null;
      run.skippedCount++;
      await sendHealthAlert(client, run, 'All selected account types are out of stock.');
      console.log(`Auto-generation skipped for guild ${run.guildId}: no selected types are in stock.`);
      refreshPanel(run, true);
      return;
    }

    if (!limitAvailableTypes.length) {
      run.waitingReason = null;
      run.skippedCount++;
      await sendHealthAlert(client, run, 'All selected account types have reached their daily limit.');
      console.log(`Auto-generation skipped for guild ${run.guildId}: all stocked selected types are at their daily limit.`);
      refreshPanel(run, true);
      return;
    }

    if (!availableTypes.length) {
      run.waitingReason = null;
      run.skippedCount++;
      await sendHealthAlert(client, run, 'All eligible account types are cooling down.');
      console.log(`Auto-generation skipped for guild ${run.guildId}: all eligible stocked types are on cooldown.`);
      refreshPanel(run, true);
      return;
    }

    /* Keep the paid request below separate from the stock/limit filters. */
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
    recordGeneration(run.guildId, type, 'generated');
    run.generatedCount++;
    run.generatedByType[type] = (run.generatedByType[type] ?? 0) + 1;
    run.lastType = type;
    run.lastGeneratedAt = Date.now();
    const delivery = await deliverGeneratedAccount(client, run, payload, user, type);

    run.lastError = null;
    run.lastAlertReason = null;
    recordGeneration(run.guildId, type, delivery.channelSent || delivery.dmSent ? 'successful' : 'failed',
      delivery.channelSent ? delivery.channelId : null);
    if (delivery.channelError || delivery.dmError) {
      run.waitingReason = 'A delivery destination failed; retrying from the durable queue.';
    }
    console.log(`Auto-generated ${type} for guild ${run.guildId}.`);
    refreshPanel(run, true);
  } catch (err) {
    if (err.deliveryResult?.channelError || err.deliveryResult?.dmError) {
      run.waitingReason = 'Delivery failed; the account is saved in the retry queue.';
      run.lastError = err.message;
      run.skippedCount++;
      refreshPanel(run, true);
      console.error(`Auto-generation queued a delivery retry for guild ${run.guildId}:`, err.message);
      return;
    }

    const messageSeconds = Number(err.message?.match(/wait\s+(\d+)\s*minute/i)?.[1]) * 60 ||
      Number(err.message?.match(/wait\s+(\d+)\s*second/i)?.[1]) || 0;
    const rawTimeRemaining = Number(err.timeRemaining) || 0;
    const seconds = messageSeconds ||
      (rawTimeRemaining >= 1000 ? Math.ceil(rawTimeRemaining / 1000) : rawTimeRemaining);

    if (seconds > 0) {
      const cooldownType = attemptedType ||
        run.types.find((type) => normalizeType(err.accountType) === normalizeType(type));
      if (cooldownType) {
        run.typeCooldowns.set(cooldownType, Date.now() + seconds * 1000);
        console.log(`Auto-generation skipped ${cooldownType} for ${seconds}s in guild ${run.guildId}; other types remain active.`);
      } else {
        run.cooldownUntil = Date.now() + seconds * 1000;
        console.log(`Auto-generation is rate-limited for ${seconds}s in guild ${run.guildId}; the run remains enabled.`);
      }
    }

    if (err.isDailyLimit) {
      const matchingType = err.accountType
        ? run.types.find(
          (type) => normalizeType(type) === normalizeType(err.accountType),
        )
        : null;
      const limitedTypes = matchingType
        ? [matchingType]
        : err.accountType
          ? [attemptedType].filter(Boolean)
          : run.types;
      blockLimitedTypes(run, limitedTypes, run.limits);
    }

    run.waitingReason = null;
    run.lastError = err.message;
    run.skippedCount++;
    recordGeneration(run.guildId, attemptedType || 'unknown', err.isDailyLimit ? 'skipped' : 'failed');
    console.error(`Auto-generation skipped for guild ${run.guildId}:`, err.message);
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
  setAutoGenerationConfig(guildId, { enabled: false });

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
    intervalMs: getAutoGenerationInterval(guildId),
    endsAt: null,
    nextTypeIndex: 0,
    generating: false,
    cooldownUntil: 0,
    generatedCount: 0,
    generatedByType: {},
    skippedCount: 0,
    attemptCount: 0,
    lastType: null,
    lastGeneratedAt: null,
    lastStockCheckAt: null,
    lastLimitCheckAt: null,
    lastError: null,
    lastAlertReason: null,
    waitingReason: null,
    refreshing: false,
    lastPanelRefreshAt: 0,
    stock: null,
    limits: null,
    limitBlockedTypes: new Map(),
    typeCooldowns: new Map(),
    interval: null,
    panelInterval: null,
    refresh: null,
  };

  run.interval = setInterval(() => {
    void generateNext(client, run);
  }, run.intervalMs);
  run.panelInterval = setInterval(() => refreshPanel(run, true), AUTO_PANEL_REFRESH_INTERVAL_MS);

  activeRuns.set(guildId, run);
  setAutoGenerationConfig(guildId, {
    enabled: true,
    types,
    intervalMs: run.intervalMs,
    userId,
    controlChannelId: channelId,
    controlMessageId: controlMessage?.id ?? null,
  });

  // Generate once immediately, then continue every 5 seconds until disabled.
  void generateNext(client, run);
  return true;
}

export function setAutoGenerationRefresh(guildId, refresh) {
  const run = activeRuns.get(guildId);
  if (run) run.refresh = refresh;
}

export async function restoreAutoGenerationRuns(client) {
  for (const guildId of getConfiguredGuildIds()) {
    const config = getAutoGenerationConfig(guildId);
    if (!config.enabled || activeRuns.has(guildId)) continue;
    let controlMessage = null;
    if (config.controlChannelId && config.controlMessageId) {
      const channel = await client.channels.fetch(config.controlChannelId).catch(() => null);
      controlMessage = await channel?.messages?.fetch(config.controlMessageId).catch(() => null);
    }
    enableAutoGeneration(client, {
      guildId,
      userId: config.userId,
      channelId: config.controlChannelId,
      controlMessage,
    });
    if (controlMessage) {
      setAutoGenerationRefresh(guildId, () => controlMessage.edit(buildAutoGenerationPanel(guildId)));
    }
  }
}