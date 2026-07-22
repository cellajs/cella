import { getTableColumns } from 'drizzle-orm';
import { appConfig } from 'shared';
import { describe, expect, it } from 'vitest';
import { getEntityTable } from '#/tables';
import { buildInsertableProduct, productMocksByType } from './product-mock-registry';

// Every product entity type must have a registered mock so the config-driven insert suites (RLS,
// CDC, sequence) can seed it without a hand-written fixture. `satisfies` already makes a missing
// key a compile error; this guard also catches runtime insert-readiness regressions.
describe('product mock registry', () => {
  const productTypes = appConfig.productEntityTypes;

  it('covers at least one product type (guard against registry drift)', () => {
    expect(productTypes.length).toBeGreaterThan(0);
  });

  for (const entityType of productTypes) {
    describe(entityType, () => {
      it('has a registered mock', () => {
        expect(productMocksByType[entityType]).toBeTypeOf('function');
      });

      it('builds an insert-ready row: generated columns dropped, overrides applied', () => {
        const row = buildInsertableProduct(entityType, { id: 'override-id' });
        expect(row.id).toBe('override-id');

        const generatedColumns = Object.entries(getTableColumns(getEntityTable(entityType)))
          .filter(([, column]) => column.generated)
          .map(([prop]) => prop);
        for (const prop of generatedColumns) expect(row).not.toHaveProperty(prop);
      });
    });
  }
});
