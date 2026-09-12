// Client for the BloxGen DASHBOARD API (https://api.bloxgen.net).
//
// This is a DIFFERENT surface from the official core.bloxgen.net API used in
// bloxgen.js: the official API has no account-history endpoint, but the dashboard
// API does. It authenticates with the dashboard SESSION cookie (`accessToken`),
// not the X-API-Key. The cookie lasts ~7 days and must be refreshed in .env.
//
// Cloudflare guards this host but lets plain Node requests through (an unauthenticated
// call returns a clean JSON 401, not a challenge), so a normal fetch works.
import { BLOXGEN_SESSION_COOKIE } from './config.js';

const BASE_URL = 'https://api.bloxgen.net';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36';

async function request(path) {
  if (!BLOXGEN_SESSION_COOKIE) {
    throw new Error('BLOXGEN_SESSION_COOKIE is not set in .env (see .env.example).');
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      Cookie: `accessToken=${BLOXGEN_SESSION_COOKIE}`,
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      'BloxGen session expired — update BLOXGEN_SESSION_COOKIE in .env ' +
        '(DevTools → Application → Cookies → https://bloxgen.net → copy `accessToken`).',
    );
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Invalid response from the dashboard API (HTTP ${res.status})`);
  }

  if (!json.success) {
    throw new Error(json.error?.message || json.message || `Dashboard API error (HTTP ${res.status})`);
  }
  return json.data;
}

// GET /api/accounts/history?page=&limit= -> { history: [...], pagination: {...} }
export function getHistory({ page = 1, limit = 100 } = {}) {
  return request(`/api/accounts/history?page=${page}&limit=${limit}`);
}

// Fetch every page and return the full flat list of generated accounts.
export async function getAllHistory() {
  const all = [];
  let page = 1;
  while (page <= 500) {
    const data = await getHistory({ page, limit: 100 });
    const hist = data?.history ?? [];
    all.push(...hist);
    if (!data?.pagination?.hasNextPage) break;
    page++;
  }
  return all;
}

// Find a generated account by username (case-insensitive), stopping early once found.
export async function findAccountByUsername(username) {
  const target = String(username).toLowerCase();
  let page = 1;
  while (page <= 500) {
    const data = await getHistory({ page, limit: 100 });
    const hist = data?.history ?? [];
    const hit = hist.find((a) => (a.username || '').toLowerCase() === target);
    if (hit) return hit;
    if (!data?.pagination?.hasNextPage) break;
    page++;
  }
  return null;
}
