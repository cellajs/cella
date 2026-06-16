/**
 * Shared configuration for Artillery load tests.
 *
 * Everything is derived from the fork's own config — there are no bench-specific
 * environment overrides. URLs, slug and cookie version come from `appConfig`;
 * the dev database port comes from `backend/.env` (the source of truth consumed
 * by `backend/compose.yaml`). Both track the port offset chosen by `create-cella`,
 * so bench follows a fork automatically. Bench is a dev-only tool tied to the
 * local stack. Entity IDs and helpers come from seeds/ids.ts.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { appConfig } from 'shared';
import { attachmentId, ORG_ID, TENANT_ID, userEmail, userId } from './seeds/ids';

export { attachmentId, ORG_ID, TENANT_ID, userEmail, userId };

// Backend HTTP base URL (offset-aware via appConfig), e.g. http://localhost:4000.
export const BASE_URL = appConfig.backendUrl;

// Backend port; cdc and yjs run on backend+1 / backend+2 in the dev stack.
export const BACKEND_PORT = Number(new URL(appConfig.backendUrl).port || '80');

// CDC health endpoint (backend port + 1), full depth for the poller.
export const CDC_HEALTH_URL = `http://localhost:${BACKEND_PORT + 1}/health?depth=full`;

// Session cookie name — must match the backend: `${slug}-session-${cookieVersion}`.
export const SESSION_COOKIE_NAME = `${appConfig.slug}-session-${appConfig.cookieVersion}`;

// Dev database port from backend/.env (offset-aware); falls back to the default.
function readDbPort(): number {
  try {
    const env = readFileSync(new URL('../../backend/.env', import.meta.url), 'utf8');
    const match = env.match(/^DB_PORT=(\d+)/m);
    if (match) return Number(match[1]);
  } catch {
    // .env not present (e.g. CI) — use the default dev port.
  }
  return 5432;
}

export const PG = {
  host: '0.0.0.0',
  port: readDbPort(),
  user: 'postgres',
  password: 'postgres',
  database: 'postgres',
} as const;

export const DB_URL = `postgres://${PG.user}:${PG.password}@${PG.host}:${PG.port}/${PG.database}`;

// Inject BASE_URL so Artillery scenarios can interpolate $processEnvironment.BASE_URL.
export function createBenchProcessEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  // biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
  return { ...process.env, BASE_URL, ...overrides };
}
