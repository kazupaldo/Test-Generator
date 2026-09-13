// Non-sensitive ownership metadata used to protect history lookups.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../config.js';

const FILE = join(ROOT, 'account-owners.json');
let cache;
try {
  cache = JSON.parse(readFileSync(FILE, 'utf8'));
} catch {
  cache = {};
}

function save() {
  writeFileSync(FILE, JSON.stringify(cache, null, 2), { mode: 0o600 });
}

export function recordAccountOwner(username, userId, guildId) {
  if (!username || !userId) return;
  cache[String(username).toLowerCase()] = { userId, guildId: guildId || null };
  save();
}

export function isAccountOwner(username, userId) {
  return Boolean(username && userId && cache[String(username).toLowerCase()]?.userId === userId);
}