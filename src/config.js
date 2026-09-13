// Loads .env from the project root (regardless of cwd) and exposes config.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(ROOT, '.env') });

export const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
export const BLOXGEN_API_KEY = process.env.BLOXGEN_API_KEY;
// Dashboard session cookie (accessToken) for the account-history endpoint. ~7-day lifetime.
export const BLOXGEN_SESSION_COOKIE = process.env.BLOXGEN_SESSION_COOKIE;
export const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;
export const PREFIX = process.env.PREFIX || '+';

// Brand colors used across embeds.
export const COLORS = {
  brand: 0x5865f2,
  success: 0x57f287,
  error: 0xed4245,
};
