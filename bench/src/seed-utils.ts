import type pg from 'pg';
import format from 'pg-format';
import { type BenchSeed, getBenchSeedCleanupWhere, type TableBenchSeed } from './registry';

const BATCH_SIZE = 200;

/**
 * Convert a camelCase record key to its snake_case Postgres column name.
 * Inverse of the transform in `recordToRow`. Relies on the DB using snake_case
 * columns (all bench tables do).
 */
function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Convert a camelCase record to a snake_case value array for SQL insertion.
 * Columns listed in `pgArrayColumns` are kept as native JS arrays (pg driver converts them).
 * All other arrays/objects are JSON-stringified for json/jsonb columns.
 */
function recordToRow(record: Record<string, unknown>, columns: string[], pgArrayColumns?: Set<string>): unknown[] {
  return columns.map((col) => {
    const key = col.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    const value = record[key];
    if (value !== null && value !== undefined && typeof value === 'object' && !(value instanceof Date)) {
      if (Array.isArray(value) && pgArrayColumns?.has(col)) return value;
      return JSON.stringify(value);
    }
    return value ?? null;
  });
}

/**
 * Insert rows in batches to avoid exceeding Postgres parameter limits.
 */
async function batchInsert(pool: pg.Pool, table: string, columns: string[], rows: unknown[][]): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const valueClauses: string[] = [];
    const params: unknown[] = [];

    for (let r = 0; r < batch.length; r++) {
      const row = batch[r];
      const placeholders = row.map((_, c) => `$${r * columns.length + c + 1}`);
      valueClauses.push(`(${placeholders.join(', ')})`);
      params.push(...row);
    }

    const sql = `INSERT INTO ${format('%I', table)} (${columns.join(', ')}) VALUES ${valueClauses.join(', ')} ON CONFLICT DO NOTHING`;
    await pool.query(sql, params);
  }
}

export async function insertSeedRows(pool: pg.Pool, seed: TableBenchSeed, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;

  const columns = Object.keys(rows[0]).map(camelToSnake);
  const pgArrays = seed.pgArrayColumns ? new Set(seed.pgArrayColumns) : undefined;
  const seedRows = rows.map((row) => recordToRow(row, columns, pgArrays));
  await batchInsert(pool, seed.table, columns, seedRows);
}

export async function cleanupBenchSeed(client: pg.PoolClient, seed: BenchSeed): Promise<void> {
  if (seed.kind === 'custom') {
    await seed.cleanup?.({ client });
    return;
  }

  await client.query(`DELETE FROM ${format('%I', seed.table)} WHERE ${getBenchSeedCleanupWhere(seed)}`);
}
