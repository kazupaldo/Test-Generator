// Small client for the BloxGen API (https://docs.bloxgen.net)
import { BLOXGEN_API_KEY } from './config.js';

const BASE_URL = 'https://core.bloxgen.net';

// Account type values accepted by /api/generate. The public docs currently
// show five types; the dashboard's newer 18+ age-verified option uses this
// exact label and may still depend on the BloxGen plan/stock for the API key.
export const ACCOUNT_TYPES = [
  'alt',
  '+30 days old',
  '+1 year old',
  '5+ years old',
  'dump',
  '18+ age verified',
];

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(...values) {
  for (const value of values) {
    const number = numberOrNull(value);
    if (number !== null) return number;
  }
  return null;
}

function isFalse(value) {
  return value === false || String(value).toLowerCase() === 'false';
}

function canUseRemaining(remaining) {
  return remaining === null || remaining > 0;
}

function normalizeTypeName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function normalizeTypeLimit(item) {
  const dailyLimit = firstNumber(item.dailyLimit, item.limit, item.maxGenerations);
  const generationsToday = firstNumber(item.generationsToday, item.used, item.generated);
  const explicitRemaining = firstNumber(item.remainingGenerations, item.remaining);
  const remainingGenerations = explicitRemaining ??
    (dailyLimit !== null && generationsToday !== null
      ? Math.max(0, dailyLimit - generationsToday)
      : null);

  return {
    accountType: item.accountType ?? item.type ?? item.name,
    generationsToday,
    dailyLimit,
    remainingGenerations,
    canGenerate: !isFalse(item.canGenerate) &&
      canUseRemaining(remainingGenerations) &&
      !(dailyLimit !== null && generationsToday !== null && generationsToday >= dailyLimit),
  };
}

// BloxGen has returned a few different field names for limits over time. Keep
// one normalized shape in the bot so auto-generation and /limits cannot drift.
export function normalizeDailyLimit(data = {}) {
  const source = data?.data && typeof data.data === 'object' ? data.data : data;
  const dailyLimit = firstNumber(source.dailyLimit, source.limit, source.maxGenerations);
  const generationsToday = firstNumber(source.generationsToday, source.used, source.generated);
  const explicitRemaining = firstNumber(source.remainingGenerations, source.remaining);
  const remainingGenerations = explicitRemaining ??
    (dailyLimit !== null && generationsToday !== null
      ? Math.max(0, dailyLimit - generationsToday)
      : null);
  const rawTypes = source.accountTypes ??
    source.account_types ??
    source.accountTypeLimits ??
    source.types ??
    [];
  const typeItems = Array.isArray(rawTypes)
    ? rawTypes
    : Object.entries(rawTypes).map(([accountType, value]) =>
      value && typeof value === 'object'
        ? { accountType, ...value }
        : numberOrNull(value) !== null
          ? { accountType, remainingGenerations: value }
          : { accountType, canGenerate: value },
    );
  const accountTypes = typeItems
    .filter((item) => item && typeof item === 'object')
    .map(normalizeTypeLimit)
    .filter((item) => item.accountType);

  return {
    generationsToday,
    dailyLimit,
    remainingGenerations,
    resetTime: source.resetTime ?? source.resetsAt ?? source.resetAt ?? null,
    accountTypes,
    canGenerate: !isFalse(source.canGenerate) &&
      canUseRemaining(remainingGenerations) &&
      !(dailyLimit !== null && generationsToday !== null && generationsToday >= dailyLimit),
  };
}

export function getTypeDailyLimit(snapshot, type) {
  return snapshot?.accountTypes?.find(
    (item) => normalizeTypeName(item.accountType) === normalizeTypeName(type),
  ) ?? null;
}

export function canGenerateType(snapshot, type) {
  if (!snapshot || snapshot.canGenerate === false) return false;
  const typeLimit = getTypeDailyLimit(snapshot, type);
  return !typeLimit || typeLimit.canGenerate;
}

async function request(path, { method = 'GET', body, apiKey = BLOXGEN_API_KEY } = {}) {
  if (!apiKey) {
    throw new Error('No BloxGen API key is configured. Add your personal key with +key before generating.');
  }
  // Some endpoints ignore the X-API-Key header (e.g. /api/generate,
  // /api/botting/check), so send the key everywhere: header, query, and body.
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('apiKey', apiKey);

  const payload = body ? { apiKey, ...body } : undefined;

  const res = await fetch(url, {
    method,
    headers: {
      'X-API-Key': apiKey,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Invalid response from the API (HTTP ${res.status})`);
  }

  if (!json.success) {
    const error = new Error(json.message || json.error || `API error (HTTP ${res.status})`);
    error.status = res.status;
    error.timeRemaining = json.timeRemaining;
    error.accountType = json.accountType;
    error.isDailyLimit = /daily\s*limit|limit\s*(?:reached|exceeded)|no\s+generations?\s+remaining/i
      .test(error.message);
    throw error;
  }
  return json.data;
}

// POST /api/generate -> { username, password, cookie, type, cost, id, region, ... }
export function generate(type, apiKey) {
  return request('/api/generate', { method: 'POST', body: { type }, apiKey });
}

// GET /api/balance -> { balance }
export function getBalance(apiKey) {
  return request('/api/balance', { apiKey });
}

// GET /api/botting/check -> { userid, max_followers, available, ... }
export function checkFollowers(userid, apiKey) {
  return request(`/api/botting/check?userid=${encodeURIComponent(userid)}`, { apiKey });
}

// GET /api/stock -> { "<type>": true|false, ... } (in stock per type)
export function getStock(apiKey) {
  return request('/api/stock', { apiKey });
}

// GET /api/prices -> { "<type>": number, ... } (price per type)
export function getPrices(apiKey) {
  return request('/api/prices', { apiKey });
}

// GET /api/daily-limit -> { generationsToday, remainingGenerations, dailyLimit, resetTime, accountTypes[] }
export function getDailyLimit(apiKey) {
  return request('/api/daily-limit', { apiKey }).then(normalizeDailyLimit);
}

// GET /api/botting/status -> { bottingServer: { available, status }, service }
export function getBottingStatus(apiKey) {
  return request('/api/botting/status', { apiKey });
}

// GET /health -> { status: "ok" } (no auth, no success/data envelope)
export async function getHealth() {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    const json = await res.json();
    return { ok: res.ok && json.status === 'ok' };
  } catch {
    return { ok: false };
  }
}
