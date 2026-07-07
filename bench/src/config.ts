import process from 'node:process';
import { appConfig } from 'shared';

// Load backend/.env for the offset-aware DATABASE_* URLs; absent in CI.
try {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url));
} catch {}

/**
 * Shared configuration for Artillery load tests, derived from the fork's own
 * config (`appConfig`, `backend/.env`) so bench follows a fork's port offset
 * automatically. Dev-only, tied to the local stack.
 */
export const BASE_URL = appConfig.backendUrl;

export const BACKEND_PORT = Number(new URL(appConfig.backendUrl).port || '80');

export const CDC_HEALTH_URL = `http://localhost:${BACKEND_PORT + 1}/health?depth=full`;

export const SESSION_COOKIE_NAME = `${appConfig.slug}-session-${appConfig.cookieVersion}`;

// Admin (superuser) connection: bench seeds bypass RLS via `session_replication_role`.
// biome-ignore lint/style/noProcessEnv: bench reads the fork's DATABASE_ADMIN_URL here.
export const DB_URL = process.env.DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@0.0.0.0:5432/postgres';

// Inject BASE_URL so Artillery scenarios can interpolate $processEnvironment.BASE_URL.
export function createBenchProcessEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  // biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
  return { ...process.env, BASE_URL, ...overrides };
}
