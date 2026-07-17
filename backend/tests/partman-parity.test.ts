import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { activitiesTable } from '#/modules/activities/activities-db';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { seenByTable } from '#/modules/seen/seen-by-db';
import { unsubscribeTokensTable } from '#/modules/user/unsubscribe-tokens-db';
import { partitionConfigs } from '../scripts/migrations/10-partman.migration';

/**
 * The partman migration converts tables to partitioned clones straight from the catalog
 * (LIKE + captured PK/FK/index DDL), so there is no hardcoded SQL copy to drift anymore.
 * What remains are the structural preconditions PostgreSQL imposes on the conversion —
 * violating any of them makes the (fail-loud) migration abort at migrate time. This suite
 * moves that failure to CI: any schema change that breaks a precondition fails here first.
 */

const drizzleTables: Record<string, PgTable> = {
  sessions: sessionsTable,
  tokens: tokensTable,
  unsubscribe_tokens: unsubscribeTokensTable,
  activities: activitiesTable,
  seen_by: seenByTable,
};

describe('partman configs satisfy partitioning preconditions of the Drizzle schemas', () => {
  it('covers every partition config with a known Drizzle table', () => {
    for (const config of partitionConfigs) {
      expect(drizzleTables[config.name], `no Drizzle table registered in this test for '${config.name}'`).toBeDefined();
    }
  });

  for (const config of partitionConfigs) {
    describe(config.name, () => {
      const tableConfig = getTableConfig(drizzleTables[config.name]);
      const pkColumns = tableConfig.primaryKeys[0]?.columns.map((c) => c.name) ?? [];
      const partitionColumn = tableConfig.columns.find((c) => c.name === config.partitionColumn);

      it('has a composite primary key that includes the partition column', () => {
        // Postgres requires the partition column in every unique constraint, incl. the PK.
        expect(pkColumns).toContain(config.partitionColumn);
      });

      it('has a NOT NULL partition column (pg_partman control column requirement)', () => {
        expect(partitionColumn, `column '${config.partitionColumn}' missing on ${config.name}`).toBeDefined();
        expect(partitionColumn?.notNull).toBe(true);
      });

      it('declares no unique constraints or unique indexes besides the PK (impossible on the partitioned table)', () => {
        expect(tableConfig.uniqueConstraints).toEqual([]);
        const uniqueColumns = tableConfig.columns.filter((c) => c.isUnique).map((c) => c.name);
        expect(uniqueColumns).toEqual([]);
        const uniqueIndexes = tableConfig.indexes.filter((i) => i.config.unique).map((i) => i.config.name);
        expect(uniqueIndexes).toEqual([]);
      });
    });
  }
});
