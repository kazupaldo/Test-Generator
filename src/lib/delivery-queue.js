// Durable, encrypted retry queue for generated accounts. The queue is also the
// duplicate ledger: a destination/username pair is only delivered once.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SESSION_SECRET } from '../config.js';
import { sendDirectMessage } from './delivery.js';
import { buildAccountPayload } from './ui.js';
import { getDeliveryChannelForType } from './settings.js';

const FILE = join(ROOT, 'delivery-queue.json');
const KEY = SESSION_SECRET ? createHash('sha256').update(SESSION_SECRET).digest() : null;
let cache = { pending: [], delivered: {} };

function load() {
  try {
    const stored = JSON.parse(readFileSync(FILE, 'utf8'));
    if (KEY && stored.iv && stored.authTag && stored.ciphertext) {
      const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(stored.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(stored.authTag, 'base64'));
      cache = JSON.parse(Buffer.concat([
        decipher.update(Buffer.from(stored.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8'));
    } else if (stored.pending && stored.delivered) {
      cache = stored;
    }
  } catch {
    cache = { pending: [], delivered: {} };
  }
}

function save() {
  const raw = JSON.stringify(cache);
  const output = KEY
    ? (() => {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', KEY, iv);
      const ciphertext = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
      return JSON.stringify({
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      }, null, 2);
    })()
    : JSON.stringify(cache, null, 2);
  const temporary = `${FILE}.tmp`;
  writeFileSync(temporary, output, { mode: 0o600 });
  renameSync(temporary, FILE);
}

load();

function deliveryKey(item) {
  return [
    item.guildId || 'direct',
    item.destination,
    item.channelId || item.ownerId,
    item.account?.username,
  ].join(':');
}

export function isDelivered(item) {
  return Boolean(cache.delivered[deliveryKey(item)]);
}

export function enqueueDelivery(item) {
  if (!item?.account?.username || isDelivered(item)) return false;
  if (!cache.pending.some((pending) => deliveryKey(pending) === deliveryKey(item))) {
    cache.pending.push({ ...item, attempts: 0, queuedAt: Date.now() });
    save();
    return true;
  }
  return false;
}

export function markDelivered(item) {
  cache.delivered[deliveryKey(item)] = Date.now();
  cache.pending = cache.pending.filter((pending) => deliveryKey(pending) !== deliveryKey(item));
  save();
}

export function getPendingDeliveryCount(guildId) {
  return cache.pending.filter((item) => !guildId || item.guildId === guildId).length;
}

export async function drainDeliveryQueue(client, { guildId } = {}) {
  const pending = [...cache.pending].filter((item) =>
    (!guildId || item.guildId === guildId) &&
    (!item.nextAttemptAt || item.nextAttemptAt <= Date.now()));
  for (const item of pending) {
    if (isDelivered(item)) {
      markDelivered(item);
      continue;
    }
    try {
      const user = await client.users.fetch(item.ownerId);
      const payload = buildAccountPayload(item.account, {
        ownerId: item.ownerId,
        includeCredentials: item.destination === 'dm',
      });
      if (item.destination === 'dm') {
        await sendDirectMessage(user, payload);
      } else {
        const channelId = item.channelId || getDeliveryChannelForType(item.guildId, item.type);
        const channel = await client.channels.fetch(channelId);
        await channel.send(payload);
      }
      markDelivered(item);
    } catch (error) {
      const current = cache.pending.find((pendingItem) => deliveryKey(pendingItem) === deliveryKey(item));
      if (current) {
        current.attempts = (current.attempts ?? 0) + 1;
        current.lastError = error.message;
        current.nextAttemptAt = Date.now() + Math.min(15 * 60_000, 5_000 * 2 ** Math.min(current.attempts, 8));
        save();
      }
    }
  }
}