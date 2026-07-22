import { getTableColumns } from 'drizzle-orm';
import type { ProductEntityType } from 'shared';
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import { getEntityTable } from '#/tables';

/**
 * Factory producing a fully-populated row (SELECT shape) for a product entity, keyed by a
 * deterministic seed so the same key yields the same data.
 */
export type ProductMockFn = (key?: string) => Record<string, unknown>;

/**
 * Fork extension point: maps each product entity type to its mock factory, mirroring how
 * `entityTables` (backend/src/tables.ts) maps types to Drizzle tables. Base Cella registers
 * `attachment`; a fork adds one entry per product entity it defines. `satisfies
 * Record<ProductEntityType, ProductMockFn>` makes a missing entry a compile error, and the drift
 * guard in `product-mock-registry.test.ts` fails loudly too. Suites that seed product rows
 * (RLS, CDC, sequence) resolve mocks by type from this registry, so they stay identical across
 * forks.
 */
export const productMocksByType = {
  attachment: mockAttachment,
} as const satisfies Record<ProductEntityType, ProductMockFn>;

/**
 * Projects a product entity's mock into an insert-ready row: drops DB-generated columns (e.g. the
 * materialized `path`, which Postgres computes and rejects on insert) and applies caller overrides
 * last (deterministic ids, real tenant/ancestor ids, audit users, timestamps). Replaces the
 * strip-and-rebind every product-insert test would otherwise hand-roll.
 */
export function buildInsertableProduct(
  entityType: ProductEntityType,
  overrides: Record<string, unknown> = {},
  key?: string,
): Record<string, unknown> {
  const mock = productMocksByType[entityType](key);
  // Generated columns are DB-computed; Postgres rejects an explicit value on insert.
  const generatedProps = new Set(
    Object.entries(getTableColumns(getEntityTable(entityType)))
      .filter(([, column]) => column.generated)
      .map(([prop]) => prop),
  );
  const row: Record<string, unknown> = {};
  for (const [prop, value] of Object.entries(mock)) {
    if (generatedProps.has(prop)) continue;
    row[prop] = value;
  }
  return { ...row, ...overrides };
}
