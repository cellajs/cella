import process from 'node:process';
import { appConfig } from 'shared';
import { localDatabaseUrl } from 'shared/local-database';
import { loadBackendDotenv } from 'shared/utils/worker-env';
import { z } from 'zod';

// The app's own overrides and its cookie secret; absent in CI.
loadBackendDotenv();

/** Bench's variables, from the shell or backend/.env; a service port defaults to `appConfig.services`. */
const envSchema = z.object({
  // The app's backend port, from backend/.env.
  PORT: z.coerce.number().default(appConfig.services.backend.port),
  // The cdc worker's and the relay's overrides, read as those services read them.
  CDC_HEALTH_PORT: z.coerce.number().default(appConfig.services.cdc.port),
  YJS_PORT: z.coerce.number().default(appConfig.services.yjs.port),
  YJS_DOCS: z.coerce.number().default(20),
  YJS_TYPERS: z.coerce.number().default(3),
  YJS_DURATION_S: z.coerce.number().default(120),
  // Keystroke spacing in milliseconds, `min-max` with both halves.
  YJS_KEYSTROKE_MS: z
    .string()
    .regex(/^\d+-\d+$/, 'YJS_KEYSTROKE_MS is a range in milliseconds, such as 200-300')
    .default('200-300')
    .transform((range): [min: number, max: number] => {
      const [min, max] = range.split('-');
      return [Number(min), Number(max)];
    })
    .refine(([min, max]) => min <= max, 'YJS_KEYSTROKE_MS names its shorter spacing first'),
  YJS_SSE_VIEWERS: z.coerce.number().optional(),
  YJS_STAGGER_S: z.coerce.number().default(10),
  YJS_DOC_OFFSET: z.coerce.number().default(0),
  COOKIE_SECRET: z.string().default(''),
  HOLD_MS: z.coerce.number().default(25_000),
  SYNC_MODE: z.enum(['immediate', 'lazy']).default('lazy'),
  DATABASE_ADMIN_URL: z.string().default(localDatabaseUrl('dev', 'postgres')),
});

/** Parsed at import: a malformed variable stops bench with its name before anything runs. */
// biome-ignore lint/style/noProcessEnv: bench reads its environment here, once.
const env = envSchema.parse(process.env);

/** Derived from `appConfig.services` and `backend/.env` so bench follows the app's port offset. Dev-only, local stack. */
// Measures the backend port directly: the Vite proxy serializes requests and resets connections. The configured mount path is preserved so API routes resolve.
const backendMountPath = new URL(appConfig.backendUrl).pathname.replace(/\/$/, '');
export const BACKEND_PORT = env.PORT;
export const BASE_URL = `http://localhost:${BACKEND_PORT}${backendMountPath}`;

export const CDC_HEALTH_PORT = env.CDC_HEALTH_PORT;
export const CDC_HEALTH_URL = `http://localhost:${CDC_HEALTH_PORT}/health?depth=full`;

export const YJS_PORT = env.YJS_PORT;
/** The relay directly, like BASE_URL: the Vite proxy's `/yjs` path would add a hop to every frame. */
export const YJS_URL = `ws://localhost:${YJS_PORT}`;
export const YJS_HEALTH_URL = `http://localhost:${YJS_PORT}/health?depth=full`;

/** Shape of the `yjs-typing` scenario: documents, typing clients per document, typing time and keystroke spacing. */
export const YJS_TYPING = {
  docs: env.YJS_DOCS,
  typers: env.YJS_TYPERS,
  durationS: env.YJS_DURATION_S,
  keystrokeMs: env.YJS_KEYSTROKE_MS,
  /** Users on the app's SSE stream, as non-editing viewers; defaults to one per document. */
  sseViewers: env.YJS_SSE_VIEWERS,
  /** Seconds over which documents start typing; 0 starts them together, which lines up their compaction deadlines. */
  staggerS: env.YJS_STAGGER_S,
  /** First bench attachment to edit: a second run on one stack takes fresh documents with an offset past the first run's. */
  docOffset: env.YJS_DOC_OFFSET,
};

export const SESSION_COOKIE_NAME = `${appConfig.slug}-session-${appConfig.cookieVersion}`;

/** Signs the bench session cookies like the app does; read from backend/.env. */
export const COOKIE_SECRET = env.COOKIE_SECRET;

/** How long an SSE benchmark subscriber remains connected. */
export const SSE_HOLD_MS = env.HOLD_MS;
/** Whether the SSE benchmark merges notifications or fetches each range immediately. */
export const SSE_SYNC_MODE = env.SYNC_MODE;

// Admin (superuser) connection: bench seeds bypass RLS via `session_replication_role`.
export const DB_URL = env.DATABASE_ADMIN_URL;
