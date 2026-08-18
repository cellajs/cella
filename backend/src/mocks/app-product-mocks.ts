import type { ProductEntityType } from 'shared';
import type { ProductMockFn } from '#/mocks/product-mock-registry';

/**
 * Merged into `productMocksByType`: one entry per app-owned product entity type, so the config-driven
 * insert suites (RLS, CDC, sequence) can seed those rows. The registry's `satisfies` enforces coverage.
 */
export const appProductMocks = {} satisfies Partial<Record<ProductEntityType, ProductMockFn>>;
