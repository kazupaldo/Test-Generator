// Small durable daily statistics store. It intentionally contains metadata only,
// never account credentials.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../config.js';

const FILE = join(ROOT, 'generation-stats.json');
let cache;
try {
  cache = JSON.parse(readFileSync(FILE, 'utf8'));
} catch {
  cache = {};
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function blank() {
  return {
    generated: 0,
    successful: 0,
    skipped: 0,
    failed: 0,
    byType: {},
    byChannel: {},
  };
}

function getBucket(guildId) {
  const key = guildId || 'direct';
  const date = today();
  if (!cache[key] || cache[key].date !== date) {
    cache[key] = { date, ...blank() };
  }
  return cache[key];
}

function save() {
  writeFileSync(FILE, JSON.stringify(cache, null, 2), { mode: 0o600 });
}

export function recordGeneration(guildId, type, outcome, channelId = null) {
  const stats = getBucket(guildId);
  const typeStats = stats.byType[type] ?? { generated: 0, successful: 0, skipped: 0, failed: 0 };
  stats.generated += outcome === 'generated' ? 1 : 0;
  stats[outcome] = (stats[outcome] ?? 0) + 1;
  typeStats[outcome] = (typeStats[outcome] ?? 0) + 1;
  stats.byType[type] = typeStats;
  if (channelId && outcome === 'successful') {
    stats.byChannel[channelId] = (stats.byChannel[channelId] ?? 0) + 1;
  }
  save();
  return stats;
}

export function getDailyStats(guildId) {
  return structuredClone(getBucket(guildId));
}