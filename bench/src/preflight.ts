import pg from 'pg';
import { appConfig } from 'shared';
import { BACKEND_PORT, BASE_URL, DB_URL } from './config';

// Only services the app actually runs are health-checked: cdc, yjs, and mcp are
// skipped when disabled in appConfig.services.
export const SERVICES = {
  backend: `${BASE_URL}/health`,
  ...(appConfig.services.cdc.enabled !== false ? { cdc: `http://localhost:${BACKEND_PORT + 1}/health` } : {}),
  ...(appConfig.services.yjs.enabled !== false ? { yjs: `http://localhost:${BACKEND_PORT + 2}/health` } : {}),
  ...(appConfig.services.mcp.enabled !== false ? { mcp: `http://localhost:${BACKEND_PORT + 3}/health` } : {}),
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
 * One-shot readiness probe (Postgres + every enabled service), shared by the bench
 * CLI and the Vitest smoke test. Unlike `assertInfrastructureReady`, it never polls
 * or exits — returns `false` immediately so callers can skip gracefully.
 */
export async function isInfrastructureReady(): Promise<boolean> {
  if (!(await isPostgresReady())) return false;
  for (const url of Object.values(SERVICES)) {
    if (!(await isServiceHealthy(url))) return false;
  }
  return true;
}
