import { getTableName } from 'drizzle-orm';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { unsubscribeTokensTable } from '#/modules/user/unsubscribe-tokens-db';
import { partitionConfigs } from '../scripts/migrations/10-partman.migration';

/**
 * The partman migration recreates partitioned tables from hardcoded SQL (Postgres cannot convert
 * a table in place, and drizzle-kit cannot emit partitioned DDL). That SQL silently drifted from
 * the Drizzle schemas in the past — `token` vs `secret` columns, five missing session columns —
 * which would corrupt or fail the data copy on a fresh install. This suite pins the hardcoded
 * SQL to the Drizzle schemas so any schema change that forgets the partman side fails CI.
 */

const drizzleTables: Record<string, PgTable> = {
  sessions: sessionsTable,
  tokens: tokensTable,
  unsubscribe_tokens: unsubscribeTokensTable,
};

/** Split a CREATE TABLE body on commas that are not nested inside parentheses. */
const splitTopLevel = (body: string) =>
  body
    .split(/,(?![^(]*\))/)
    .map((line) => line.trim())
    .filter(Boolean);

const parseCreateTable = (sql: string) => {
  const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(') PARTITION BY'));
  const lines = splitTopLevel(body);

  const columns = lines
    .filter((line) => !line.startsWith('CONSTRAINT'))
    .map((line) => {
      const [name, ...rest] = line.split(/\s+/);
      const type = rest
        .join(' ')
        .replace(/\s+DEFAULT\s+.*$/, '')
        .replace(/\s+NOT NULL$/, '');
      return { name, type };
    });

  const primaryKey =
    body
      .match(/PRIMARY KEY \(([^)]+)\)/)?.[1]
      .split(',')
      .map((c) => c.trim()) ?? [];

  const foreignKeys = [...body.matchAll(/FOREIGN KEY \((\w+)\) REFERENCES (\w+)\((\w+)\)/g)].map((m) => ({
    column: m[1],
    references: `${m[2]}.${m[3]}`,
  }));

  return { columns, primaryKey, foreignKeys };
};

const parseIndex = (sql: string) => {
  const match = sql.match(/^CREATE INDEX (\w+) ON (\w+) \(([^)]+)\)$/);
  if (!match) throw new Error(`Unparseable index SQL: ${sql}`);
  return { name: match[1], columns: match[3].split(',').map((c) => c.trim()) };
};

describe('partman migration parity with Drizzle schemas', () => {
  const explicitConfigs = partitionConfigs.filter((c) => c.createTableSql !== null);

  it('covers every explicit-SQL partition config with a known Drizzle table', () => {
    for (const config of explicitConfigs) {
      expect(drizzleTables[config.name], `no Drizzle table registered in this test for '${config.name}'`).toBeDefined();
    }
  });

  for (const config of explicitConfigs) {
    describe(config.name, () => {
      const table = drizzleTables[config.name];
      const parsed = parseCreateTable(config.createTableSql!);
      const tableConfig = getTableConfig(table);

      it('declares the same columns (names and types, in order)', () => {
        const drizzleColumns = tableConfig.columns.map((c) => ({ name: c.name, type: c.getSQLType() }));
        expect(parsed.columns).toEqual(drizzleColumns);
      });

      it('declares the same primary key', () => {
        const drizzlePk = tableConfig.primaryKeys[0]?.columns.map((c) => c.name) ?? [];
        expect(parsed.primaryKey).toEqual(drizzlePk);
      });

      it('declares the same foreign keys', () => {
        const drizzleFks = tableConfig.foreignKeys
          .map((fk) => {
            const ref = fk.reference();
            return {
              column: ref.columns[0].name,
              references: `${getTableName(ref.foreignTable)}.${ref.foreignColumns[0].name}`,
            };
          })
          .sort((a, b) => a.column.localeCompare(b.column));
        const parsedFks = [...parsed.foreignKeys].sort((a, b) => a.column.localeCompare(b.column));
        expect(parsedFks).toEqual(drizzleFks);
      });

      it('declares the same indexes (names and columns)', () => {
        const drizzleIndexes = tableConfig.indexes
          .map((i) => ({
            // Every index in these schemas is explicitly named; fall back for the type only.
            name: i.config.name ?? '',
            // IndexedColumn lacks a public name accessor
            columns: i.config.columns.map((c) => (c as any).name as string),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        const sqlIndexes = config.indexesSql.map(parseIndex).sort((a, b) => a.name.localeCompare(b.name));
        expect(sqlIndexes).toEqual(drizzleIndexes);
      });

      it('partitions by a primary key column', () => {
        // Postgres requires the partition column in every unique constraint, incl. the PK.
        expect(parsed.primaryKey).toContain(config.partitionColumn);
      });
    });
  }
});
