/**
 * Infrastructure readiness checks shared between the bench CLI and the bench
 * smoke test. Side-effect free (no spinners, no `process.exit`) so it can be
 * imported from a Vitest test to decide whether to skip when `pnpm dev` is not
 * running.
 */

import pg from 'pg';
import { appConfig } from 'shared';
import { BACKEND_PORT, BASE_URL, DB_URL } from './config';

// Only services the app actually runs are health-checked. yjs and ai are skipped
// when disabled in appConfig.services.
export const SERVICES = {
  backend: `${BASE_URL}/health`,
  ...(appConfig.services.cdc.enabled !== false ? { cdc: `http://localhost:${BACKEND_PORT + 1}/health` } : {}),
  ...(appConfig.services.yjs.enabled !== false ? { yjs: `http://localhost:${BACKEND_PORT + 2}/health` } : {}),
  ...(appConfig.services.ai.enabled !== false ? { ai: `http://localhost:${BACKEND_PORT + 3}/health` } : {}),
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

/**
 * One-shot readiness probe: Postgres reachable and every enabled service
 * healthy. Unlike the CLI's `assertInfrastructureReady`, this does not poll or
 * exit — it returns `false` immediately so callers (e.g. the smoke test) can
 * skip gracefully.
 */
export async function isInfrastructureReady(): Promise<boolean> {
  if (!(await isPostgresReady())) return false;
  for (const url of Object.values(SERVICES)) {
    if (!(await isServiceHealthy(url))) return false;
  }
  return true;
}
