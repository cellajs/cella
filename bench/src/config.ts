import process from 'node:process';
import { appConfig } from 'shared';

// Load backend/.env for the offset-aware DATABASE_* URLs; absent in CI.
try {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url));
} catch {}

/**
 * Load-test config derived from the fork's own config (`appConfig`, `backend/.env`)
 * so bench follows a fork's port offset automatically. Dev-only, local stack.
 */
// Bench the backend DIRECTLY, not appConfig.backendUrl — in dev that is the browser-facing
// vite origin (http://localhost:3000/api), so load would funnel through vite's single-threaded
// dev proxy (no keep-alive), which serializes writes and resets connections under a burst.
// backend/.env is loaded above, so process.env.PORT is the backend's real listen port. Keep
// backendUrl's mount path (e.g. /api) so routes still resolve.
const backendMountPath = new URL(appConfig.backendUrl).pathname.replace(/\/$/, '');
// biome-ignore lint/style/noProcessEnv: bench reads the fork's backend PORT from backend/.env here.
export const BACKEND_PORT = Number(process.env.PORT ?? '4000');
export const BASE_URL = `http://localhost:${BACKEND_PORT}${backendMountPath}`;

export const CDC_HEALTH_URL = `http://localhost:${BACKEND_PORT + 1}/health?depth=full`;

export const SESSION_COOKIE_NAME = `${appConfig.slug}-session-${appConfig.cookieVersion}`;

/** How long an SSE benchmark subscriber remains connected. */
// biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
export const SSE_HOLD_MS = Number(process.env.HOLD_MS ?? 25_000);
/** Whether the SSE benchmark merges notifications or fetches each delta immediately. */
// biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
export const SSE_SYNC_MODE = process.env.SYNC_MODE === 'immediate' ? 'immediate' : 'lazy';

// Admin (superuser) connection: bench seeds bypass RLS via `session_replication_role`.
// biome-ignore lint/style/noProcessEnv: bench reads the fork's DATABASE_ADMIN_URL here.
export const DB_URL = process.env.DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@0.0.0.0:5432/postgres';

// Inject BASE_URL so Artillery scenarios can interpolate $processEnvironment.BASE_URL.
export function createBenchProcessEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  // biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
  return { ...process.env, BASE_URL, ...overrides };
}
