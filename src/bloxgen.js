// Small client for the BloxGen API (https://docs.bloxgen.net)
import { BLOXGEN_API_KEY } from './config.js';

const BASE_URL = 'https://core.bloxgen.net';

// The 5 account types supported by /api/generate
export const ACCOUNT_TYPES = ['alt', '+30 days old', '+1 year old', '5+ years old', 'dump'];

async function request(path, { method = 'GET', body, apiKey } = {}) {
  // Some endpoints ignore the X-API-Key header (e.g. /api/generate,
  // /api/botting/check), so send the key everywhere: header, query, and body.
  const key = apiKey || BLOXGEN_API_KEY;
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('apiKey', key);

  const payload = body ? { apiKey: key, ...body } : undefined;

  const res = await fetch(url, {
    method,
    headers: {
      'X-API-Key': key,
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
  return request('/api/daily-limit', { apiKey });
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
