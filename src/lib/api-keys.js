import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BLOXGEN_API_KEY, ROOT, SESSION_SECRET } from '../config.js';

const FILE = join(ROOT, 'user-api-keys.json');
const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = SESSION_SECRET
  ? createHash('sha256').update(SESSION_SECRET).digest()
  : null;

let cache;
try {
  cache = JSON.parse(readFileSync(FILE, 'utf8'));
} catch {
  cache = {};
}

function requireEncryptionKey() {
  if (!ENCRYPTION_KEY) {
    throw new Error('SESSION_SECRET is required to securely store personal API keys.');
  }
}

function encrypt(value) {
  requireEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

function decrypt(record) {
  requireEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function save() {
  const temporary = `${FILE}.tmp`;
  writeFileSync(temporary, JSON.stringify(cache, null, 2), { mode: 0o600 });
  renameSync(temporary, FILE);
}

export function hasPersonalApiKey(userId) {
  return Boolean(userId && cache[userId]);
}

function recordsFor(userId) {
  const stored = cache[userId];
  if (!stored) return { active: null, keys: {} };
  if (stored.keys) return stored;
  // Migrate the original one-key format lazily.
  return { active: 'default', keys: { default: stored } };
}

export function listUserApiKeys(userId) {
  const record = recordsFor(userId);
  return {
    active: record.active,
    names: Object.keys(record.keys),
  };
}

export function setActiveUserApiKey(userId, name) {
  const record = recordsFor(userId);
  if (!record.keys[name]) return false;
  record.active = name;
  cache[userId] = record;
  save();
  return true;
}

export function getUserApiKey(userId, name = null, { fallback = true } = {}) {
  const record = recordsFor(userId);
  const keyName = name || record.active || Object.keys(record.keys)[0];
  if (userId && record.keys[keyName]) {
    try {
      return decrypt(record.keys[keyName]);
    } catch (error) {
      console.error(`Could not decrypt the personal API key for user ${userId}:`, error.message);
    }
  }
  return fallback ? BLOXGEN_API_KEY : null;
}

export function requireUserApiKey(userId) {
  const key = hasPersonalApiKey(userId) ? getUserApiKey(userId, null, { fallback: false }) : null;
  if (!key) {
    throw new Error('Add your personal BloxGen API key with `+key` before generating. The bot owner’s key is never used for auto-generation.');
  }
  return key;
}

export function setUserApiKey(userId, apiKey, name = 'default') {
  if (!userId) throw new Error('A Discord user is required.');
  const record = recordsFor(userId);
  const safeName = String(name || 'default').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').slice(0, 32) || 'default';
  cache[userId] = {
    active: record.active || safeName,
    keys: { ...record.keys, [safeName]: encrypt(apiKey) },
  };
  save();
  return safeName;
}

export function removeUserApiKey(userId, name = null) {
  if (!userId || !cache[userId]) return false;
  const record = recordsFor(userId);
  const keyName = name || record.active || Object.keys(record.keys)[0];
  delete record.keys[keyName];
  if (!Object.keys(record.keys).length) {
    delete cache[userId];
  } else {
    record.active = record.active === keyName ? Object.keys(record.keys)[0] : record.active;
    cache[userId] = record;
  }
  save();
  return true;
}