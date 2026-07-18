import { getTableName } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import { entityTables } from '#/tables';

/**
 * Delta-sync index invariant (see .todos/SYNC_FANOUT_OPTIMIZATION.md opt 1 and
 * .todos/SEQUENCE_SYNC_REWRITE.md (organization-sequence rewrite)): every product entity
 * table must carry a composite `(organization_id, seq)` index so seq-range delta reads
 * are index range scans, not org-wide filters. Forks add product tables in their own
 * modules; this guard fails their test run instead of letting the index silently go missing.
 */
describe('every product entity table has the (organization_id, seq) delta index', () => {
  const productTables = Object.entries(entityTables).filter(([type]) =>
    (appConfig.productEntityTypes as readonly string[]).includes(type),
  );

  it('covers at least one product table (guard against registry drift)', () => {
    expect(productTables.length).toBeGreaterThan(0);
  });

  for (const [entityType, table] of productTables) {
    it(`${getTableName(table)} (${entityType})`, () => {
      const { indexes } = getTableConfig(table);
      const hasDeltaIndex = indexes.some((idx) => {
        const cols = idx.config.columns.map((c) => ('name' in c ? (c as { name: string }).name : ''));
        return cols.length >= 2 && cols[0] === 'organization_id' && cols[1] === 'seq';
      });
      expect(hasDeltaIndex, `${getTableName(table)} needs index (organization_id, seq)`).toBe(true);
    });
  }
});
