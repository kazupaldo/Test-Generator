// Small client for the BloxGen API (https://docs.bloxgen.net)
import { BLOXGEN_API_KEY } from './config.js';

const BASE_URL = 'https://core.bloxgen.net';

// The 5 account types supported by /api/generate
export const ACCOUNT_TYPES = ['alt', '+30 days old', '+1 year old', '5+ years old', 'dump'];

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
    canGenerate: item.canGenerate !== false &&
      remainingGenerations !== 0 &&
      !(dailyLimit !== null && generationsToday !== null && generationsToday >= dailyLimit),
  };
}

// BloxGen has returned a few different field names for limits over time. Keep
// one normalized shape in the bot so auto-generation and /limits cannot drift.
export function normalizeDailyLimit(data = {}) {
  const dailyLimit = firstNumber(data.dailyLimit, data.limit, data.maxGenerations);
  const generationsToday = firstNumber(data.generationsToday, data.used, data.generated);
  const explicitRemaining = firstNumber(data.remainingGenerations, data.remaining);
  const remainingGenerations = explicitRemaining ??
    (dailyLimit !== null && generationsToday !== null
      ? Math.max(0, dailyLimit - generationsToday)
      : null);
  const rawTypes = data.accountTypes ?? data.types ?? [];
  const typeItems = Array.isArray(rawTypes)
    ? rawTypes
    : Object.entries(rawTypes).map(([accountType, value]) =>
      value && typeof value === 'object' ? { accountType, ...value } : { accountType, canGenerate: value },
    );
  const accountTypes = typeItems
    .filter((item) => item && typeof item === 'object')
    .map(normalizeTypeLimit)
    .filter((item) => item.accountType);

  return {
    generationsToday,
    dailyLimit,
    remainingGenerations,
    resetTime: data.resetTime ?? data.resetsAt ?? null,
    accountTypes,
    canGenerate: data.canGenerate !== false && remainingGenerations !== 0 &&
      !(dailyLimit !== null && generationsToday !== null && generationsToday >= dailyLimit),
  };
}

export function getTypeDailyLimit(snapshot, type) {
  return snapshot?.accountTypes?.find(
    (item) => String(item.accountType).toLowerCase() === String(type).toLowerCase(),
  ) ?? null;
}

export function canGenerateType(snapshot, type) {
  if (!snapshot || snapshot.canGenerate === false) return false;
  const typeLimit = getTypeDailyLimit(snapshot, type);
  return !typeLimit || typeLimit.canGenerate;
}

async function request(path, { method = 'GET', body } = {}) {
  // Some endpoints ignore the X-API-Key header (e.g. /api/generate,
  // /api/botting/check), so send the key everywhere: header, query, and body.
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('apiKey', BLOXGEN_API_KEY);

  const payload = body ? { apiKey: BLOXGEN_API_KEY, ...body } : undefined;

  const res = await fetch(url, {
    method,
    headers: {
      'X-API-Key': BLOXGEN_API_KEY,
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
export function generate(type) {
  return request('/api/generate', { method: 'POST', body: { type } });
}

// GET /api/balance -> { balance }
export function getBalance() {
  return request('/api/balance');
}

// GET /api/botting/check -> { userid, max_followers, available, ... }
export function checkFollowers(userid) {
  return request(`/api/botting/check?userid=${encodeURIComponent(userid)}`);
}

// GET /api/stock -> { "<type>": true|false, ... } (in stock per type)
export function getStock() {
  return request('/api/stock');
}

// GET /api/prices -> { "<type>": number, ... } (price per type)
export function getPrices() {
  return request('/api/prices');
}

// GET /api/daily-limit -> { generationsToday, remainingGenerations, dailyLimit, resetTime, accountTypes[] }
export function getDailyLimit() {
  return request('/api/daily-limit').then(normalizeDailyLimit);
}

// GET /api/botting/status -> { bottingServer: { available, status }, service }
export function getBottingStatus() {
  return request('/api/botting/status');
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
