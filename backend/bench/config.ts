import process from 'node:process';
import { appConfig } from 'shared';
import { localDatabaseUrl } from 'shared/local-database';
import { parseEnv } from 'shared/utils/parse-env';
import { loadRootEnv } from 'shared/utils/worker-env';
import { z } from 'zod';

// The app's cookie secret; absent in CI.
loadRootEnv(import.meta.url);

/** Bench's variables, from the shell or the repo's `.env`. */
const envSchema = z.object({
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
  SSE_HOLD_MS: z.coerce.number().default(25_000),
  SSE_SYNC_MODE: z.enum(['immediate', 'lazy']).default('lazy'),
  RANGE_KEY: z.enum(['on', 'off']).default('on'),
  PROPAGATION_EDITS: z.coerce.number().int().positive().default(200),
  PROPAGATION_WARMUPS: z.coerce.number().int().min(0).default(5),
  // Pause between the probes of `edit-propagation`: longer than the interval the API bundles an audience's changes in.
  PROPAGATION_GAP_MS: z.coerce.number().int().min(0).default(500),
  // Background edits per second of `edit-propagation-busy`, across its writers.
  PROPAGATION_LOAD: z.coerce.number().positive().default(50),
  CATCHUP_CLIENTS: z.coerce.number().int().positive().default(100),
  CATCHUP_EDITS: z.coerce.number().int().positive().default(100),
  CATCHUP_MODE: z.enum(['immediate', 'spread']).default('immediate'),
  // Queue sizes of `offline-replay`, comma-separated.
  REPLAY_SIZES: z
    .string()
    .regex(/^\d+(,\d+)*$/, 'REPLAY_SIZES lists queue sizes, such as 100,500,1000')
    .default('100,500,1000')
    .transform((sizes) => sizes.split(',').map(Number)),
  LIST_ROWS: z.coerce.number().int().positive().default(10_000),
  LIST_READS: z.coerce.number().int().positive().default(5),
  DATABASE_ADMIN_URL: z.string().default(localDatabaseUrl('dev', 'postgres')),
});

/** Parsed at import: a malformed variable stops bench with its name before anything runs. */
// biome-ignore lint/style/noProcessEnv: bench reads its environment here, once.
const env = parseEnv(envSchema, process.env);

/** Derived from `appConfig.services` so bench follows the app's port offset. Dev-only, local stack. */
// Measures the backend port directly: the Vite proxy serializes requests and resets connections. The configured mount path is preserved so API routes resolve.
const backendMountPath = new URL(appConfig.backendUrl).pathname.replace(/\/$/, '');
export const BACKEND_PORT = appConfig.services.backend.port;
export const BASE_URL = `http://localhost:${BACKEND_PORT}${backendMountPath}`;

export const CDC_HEALTH_PORT = appConfig.services.cdc.port;
export const CDC_HEALTH_URL = `http://localhost:${CDC_HEALTH_PORT}/health?depth=full`;

export const YJS_PORT = appConfig.services.yjs.port;
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

/** Signs the bench session cookies like the app does; read from the repo's `.env`. */
export const COOKIE_SECRET = env.COOKIE_SECRET;

/** Whether a sync client sends the range key of a change frame with its fetch; `off` measures the fetches without shared answers. */
export const SYNC_RANGE_KEY = env.RANGE_KEY === 'on';

/** Shape of `sse-fanout`: how long a subscriber stays connected, and whether it fetches in its spread slot or at once. */
export const SSE_FANOUT = { holdMs: env.SSE_HOLD_MS, syncMode: env.SSE_SYNC_MODE };

/** Shape of `edit-propagation` and its busy variant: measured edits after warmups, the pause between probes at rest, and the busy variant's background rate. */
export const PROPAGATION = {
  edits: env.PROPAGATION_EDITS,
  warmups: env.PROPAGATION_WARMUPS,
  loadPerSecond: env.PROPAGATION_LOAD,
  gapMs: env.PROPAGATION_GAP_MS,
};

/** Shape of `reconnect-catchup`: clients that drop their streams together, edits made while they are away, how they read the gap. */
export const CATCHUP = { clients: env.CATCHUP_CLIENTS, edits: env.CATCHUP_EDITS, mode: env.CATCHUP_MODE };

/** Shape of `offline-replay`: the queue sizes it replays, one after another. */
export const REPLAY = { sizes: env.REPLAY_SIZES };

/** Shape of `full-list-read`: rows of the large-list organization (a seed size, re-seed after a change) and cold reads per run. */
export const LIST = { rows: env.LIST_ROWS, reads: env.LIST_READS };

// Admin (superuser) connection: bench seeds bypass RLS via `session_replication_role`.
export const DB_URL = env.DATABASE_ADMIN_URL;
