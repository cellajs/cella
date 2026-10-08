import process from 'node:process';
import { appConfig } from 'shared';

// Load backend/.env for the offset-aware DATABASE_* URLs; absent in CI.
try {
  process.loadEnvFile(new URL('../../backend/.env', import.meta.url));
} catch {}

/** Derived from `appConfig.devPorts` and `backend/.env` so bench follows the app's port offset. Dev-only, local stack. */
// Measures the backend port directly: the Vite proxy serializes requests and resets connections. The configured mount path is preserved so API routes resolve.
const backendMountPath = new URL(appConfig.backendUrl).pathname.replace(/\/$/, '');
// biome-ignore lint/style/noProcessEnv: bench reads the app's backend PORT from backend/.env here.
export const BACKEND_PORT = Number(process.env.PORT ?? appConfig.devPorts.api);
export const BASE_URL = `http://localhost:${BACKEND_PORT}${backendMountPath}`;

// biome-ignore lint/style/noProcessEnv: bench reads the cdc worker's CDC_HEALTH_PORT override like the worker does.
export const CDC_HEALTH_PORT = Number(process.env.CDC_HEALTH_PORT ?? appConfig.devPorts.cdcHealth);
export const CDC_HEALTH_URL = `http://localhost:${CDC_HEALTH_PORT}/health?depth=full`;

// biome-ignore lint/style/noProcessEnv: bench reads the relay's YJS_PORT override like the relay does.
export const YJS_PORT = Number(process.env.YJS_PORT ?? appConfig.devPorts.yjs);
/** The relay directly, like BASE_URL: the Vite proxy's `/yjs` path would add a hop to every frame. */
export const YJS_URL = `ws://localhost:${YJS_PORT}`;
export const YJS_HEALTH_URL = `http://localhost:${YJS_PORT}/health?depth=full`;

/** Shape of the `yjs-typing` scenario: documents, typing clients per document, typing time and keystroke spacing. */
export const YJS_TYPING = {
  // biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
  docs: Number(process.env.YJS_DOCS ?? 20),
  // biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
  typers: Number(process.env.YJS_TYPERS ?? 3),
  // biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
  durationS: Number(process.env.YJS_DURATION_S ?? 120),
  // biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
  keystrokeMs: (process.env.YJS_KEYSTROKE_MS ?? '200-300').split('-').map(Number) as [number, number],
  /** Users on the app's SSE stream, as non-editing viewers; defaults to one per document. */
  // biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
  sseViewers: process.env.YJS_SSE_VIEWERS === undefined ? undefined : Number(process.env.YJS_SSE_VIEWERS),
  /** Seconds over which documents start typing; 0 starts them together, which lines up their compaction deadlines. */
  // biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
  staggerS: Number(process.env.YJS_STAGGER_S ?? 10),
  /** First bench attachment to edit: a second run on one stack takes fresh documents with an offset past the first run's. */
  // biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
  docOffset: Number(process.env.YJS_DOC_OFFSET ?? 0),
};

/** Set by the bench CLI for `--short`: scenarios that run outside Artillery's phases shrink themselves. */
// biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
export const BENCH_SHORT = process.env.BENCH_SHORT === '1';

export const SESSION_COOKIE_NAME = `${appConfig.slug}-session-${appConfig.cookieVersion}`;

/** Signs the bench session cookies like the app does; read from backend/.env. */
// biome-ignore lint/style/noProcessEnv: bench reads the app's cookie secret from backend/.env here.
export const COOKIE_SECRET = process.env.COOKIE_SECRET ?? '';

/** How long an SSE benchmark subscriber remains connected. */
// biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
export const SSE_HOLD_MS = Number(process.env.HOLD_MS ?? 25_000);
/** Whether the SSE benchmark merges notifications or fetches each delta immediately. */
// biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
export const SSE_SYNC_MODE = process.env.SYNC_MODE === 'immediate' ? 'immediate' : 'lazy';

// Admin (superuser) connection: bench seeds bypass RLS via `session_replication_role`.
// biome-ignore lint/style/noProcessEnv: bench reads the app's DATABASE_ADMIN_URL here.
export const DB_URL = process.env.DATABASE_ADMIN_URL ?? 'postgres://postgres:postgres@0.0.0.0:5432/postgres';

/**
 * The env of every process bench starts. BASE_URL is what Artillery scenarios interpolate as
 * `$processEnvironment.BASE_URL`. DEV_PORT_OFFSET pins this checkout's port offset: Artillery bundles a processor
 * into one file, where the offset can no longer be read from the checkout, so its own fetches would go to the main
 * checkout's ports.
 */
export function createBenchProcessEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  // biome-ignore lint/style/noProcessEnv: bench centralizes process env access here.
  return { ...process.env, BASE_URL, DEV_PORT_OFFSET: String(appConfig.devPortOffset), ...overrides };
}
