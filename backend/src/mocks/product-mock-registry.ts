import { getTableColumns } from 'drizzle-orm';
import type { ProductEntityType } from 'shared';
import { appProductMocks } from '#/mocks/app-product-mocks';
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import { getEntityTable } from '#/tables';

/** Produces a fully-populated SELECT-shape row, keyed by a seed so the same key yields the same data. */
export type ProductMockFn = (key?: string) => Record<string, unknown>;

/**
 * The template registers its own product entities here; apps add theirs in `appProductMocks`.
 * Exhaustive typing and a drift test keep the shared product-seeding suites aligned with app schemas.
 */
export const productMocksByType = {
  attachment: mockAttachment,
  ...appProductMocks,
} as const satisfies Record<ProductEntityType, ProductMockFn>;

/** Create an insert-ready product mock by dropping generated columns and applying overrides last. */
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
