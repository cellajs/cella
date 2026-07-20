import type pg from 'pg';
import format from 'pg-format';
import { type BenchSeed, getBenchSeedCleanupWhere, type TableBenchSeed } from './registry';

const BATCH_SIZE = 200;

/** snake_case column name for a camelCase key; inverse of `recordToRow`. Assumes snake_case DB columns (all bench tables). */
function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Value array for SQL insertion. Columns in `pgArrayColumns` stay native JS arrays
 * (pg driver converts them); other arrays/objects are JSON-stringified for json/jsonb.
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

/**
 * STORED generated columns (present on mock/select shapes, rejected by INSERT with PG 428C9).
 * Drizzle inserts skip them automatically; this raw-SQL path must filter explicitly.
 */
const generatedColumns = new Set(['path']);

export async function insertSeedRows(pool: pg.Pool, seed: TableBenchSeed, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;

  const columns = Object.keys(rows[0])
    .filter((key) => !generatedColumns.has(key))
    .map(camelToSnake);
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
