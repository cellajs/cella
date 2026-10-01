import pg from 'pg';
import { appConfig } from 'shared';
import { BASE_URL, DB_URL } from './config';

// Only services the app runs are health-checked: cdc, yjs, and mcp are skipped when disabled in appConfig.services.
export const SERVICES = {
  backend: `${BASE_URL}/health`,
  ...(appConfig.services.cdc.enabled !== false
    ? { cdc: `http://localhost:${appConfig.devPorts.cdcHealth}/health` }
    : {}),
  ...(appConfig.services.yjs.enabled !== false ? { yjs: `http://localhost:${appConfig.devPorts.yjs}/health` } : {}),
  ...(appConfig.services.mcp.enabled !== false ? { mcp: `http://localhost:${appConfig.devPorts.mcp}/health` } : {}),
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

/** One-shot readiness probe of Postgres and every enabled service: never polls or exits, returning `false` so callers can skip. */
export async function isInfrastructureReady(): Promise<boolean> {
  if (!(await isPostgresReady())) return false;
  for (const url of Object.values(SERVICES)) {
    if (!(await isServiceHealthy(url))) return false;
  }
  return true;
}
