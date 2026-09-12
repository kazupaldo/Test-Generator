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

export function getUserApiKey(userId) {
  if (userId && cache[userId]) {
    try {
      return decrypt(cache[userId]);
    } catch (error) {
      console.error(`Could not decrypt the personal API key for user ${userId}:`, error.message);
    }
  }
  return BLOXGEN_API_KEY;
}

export function setUserApiKey(userId, apiKey) {
  if (!userId) throw new Error('A Discord user is required.');
  cache[userId] = encrypt(apiKey);
  save();
}

export function removeUserApiKey(userId) {
  if (!userId || !cache[userId]) return false;
  delete cache[userId];
  save();
  return true;
}