import { getTableColumns } from 'drizzle-orm';
import { appConfig, hierarchy, type ProductEntityType } from 'shared';
import { appProductMocks } from '#/mocks/app-product-mocks';
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import { getEntityTable } from '#/tables';

/** Produces a fully-populated SELECT-shape row, keyed by a seed so the same key yields the same data. */
export type ProductMockFn = (key?: string) => Record<string, unknown>;

/**
 * The template registers its own product entities here; apps add theirs in `appProductMocks`.
 * Exhaustive typing and a drift test keep the shared product-seeding suites aligned with app schemas.
 */
export const productMocksByType = { attachment: mockAttachment, ...appProductMocks } as const satisfies Record<ProductEntityType, ProductMockFn>;

/** Create an insert-ready product mock by dropping generated columns and applying overrides last. */
export function buildInsertableProduct(
  entityType: ProductEntityType,
  overrides: Record<string, unknown> = {},
  key?: string,
): Record<string, unknown> {
  const columns = getTableColumns(getEntityTable(entityType));
  // The insert drops a key that names no column, so a renamed column would leave a test reading a row it never wrote.
  const unknownProps = Object.keys(overrides).filter((prop) => !(prop in columns));
  if (unknownProps.length) throw new Error(`No ${entityType} column for override ${unknownProps.join(', ')}`);

  const mock = productMocksByType[entityType](key);
  // Generated columns are DB-computed; Postgres rejects an explicit value on insert.
  const generatedProps = new Set(
    Object.entries(columns)
      .filter(([, column]) => column.generated)
      .map(([prop]) => prop),
  );
  // Nullable ancestors insert as null (org-homed) unless overridden: the SELECT-shape mock invents
  // ids that never satisfy the ancestor foreign keys channelRelationColumns declares.
  const nullableAncestorKeys = new Set<string>(hierarchy.getNullableAncestors(entityType).map((type) => appConfig.entityIdColumnKeys[type]));
  const row: Record<string, unknown> = {};
  for (const [prop, value] of Object.entries(mock)) {
    if (generatedProps.has(prop)) continue;
    row[prop] = nullableAncestorKeys.has(prop) ? null : value;
  }
  return { ...row, ...overrides };
}
