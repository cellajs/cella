import { readdirSync } from 'node:fs';
import pg from 'pg';
import { appConfig } from 'shared';
import { BASE_URL, CDC_HEALTH_PORT, COOKIE_SECRET, DB_URL, SESSION_COOKIE_NAME } from './config';
import { sealSessionCookie, sessionToken } from './seeds/session-auth';

// Only the services the scenarios use are health-checked: the API, and the cdc worker when the app runs it. Yjs and
// mcp stay out, so a stack without them (or the test config, which turns them on) does not skip or block a run.
export const SERVICES = {
  backend: `${BASE_URL}/health`,
  ...(appConfig.services.cdc.enabled !== false && { cdc: `http://localhost:${CDC_HEALTH_PORT}/health` }),
} as const;

export async function isPostgresReady(): Promise<boolean> {
  const pool = new pg.Pool({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

export async function isServiceHealthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    return res.status === 204 || res.ok;
  } catch {
    return false;
  }
}

/** The status `/me` answers for bench user 0's seeded session cookie, or null when the request itself fails. */
export async function benchSignInStatus(): Promise<number | null> {
  const value = sealSessionCookie(SESSION_COOKIE_NAME, sessionToken(0), COOKIE_SECRET, 60);
  try {
    const res = await fetch(`${BASE_URL}/me`, { headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}` } });
    return res.status;
  } catch {
    return null;
  }
}

/** One-shot readiness probe of Postgres and every enabled service: never polls or exits, returning `false` so callers can skip. */
async function isInfrastructureReady(): Promise<boolean> {
  if (!(await isPostgresReady())) return false;
  for (const url of Object.values(SERVICES)) {
    if (!(await isServiceHealthy(url))) return false;
  }
  return true;
}

/**
 * The newest migration the database has applied and the newest one this checkout ships. Another checkout's `pnpm dev`
 * on the same ports runs its own schema, so a caller that tests this checkout compares the two before it runs.
 */
async function getSchemaVersions(): Promise<{ applied: string | null; checkout: string | null }> {
  const entries = readdirSync(new URL('../../backend/drizzle/', import.meta.url), { withFileTypes: true });
  const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const checkout = folders.sort().at(-1) ?? null;

  // Migration folder names start with their timestamp, so the highest name is the newest. Schema as in backend `migrateConfig`.
  const pool = new pg.Pool({ connectionString: DB_URL, connectionTimeoutMillis: 2000 });
  try {
    const { rows } = await pool.query<{ name: string | null }>('SELECT max(name) AS name FROM "drizzle-backend".__drizzle_migrations');
    return { applied: rows[0]?.name ?? null, checkout };
  } catch {
    return { applied: null, checkout };
  } finally {
    await pool.end();
  }
}

/** Why this checkout has no stack to run against, or null when it has one: nothing reachable, or a stack on another checkout's schema. */
export async function unreadyReason(): Promise<string | null> {
  if (!(await isInfrastructureReady())) return 'local stack not reachable (run `pnpm dev` to enable)';

  const { applied, checkout } = await getSchemaVersions();
  if (applied === checkout) return null;
  return `the running stack's database is on migration ${applied ?? 'none'}, this checkout on ${checkout} (run \`pnpm dev\` from this checkout to enable)`;
}
