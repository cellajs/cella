import type { EntityHierarchy } from './entity-hierarchy';

/******************************************************************************
 * ENTITY TYPE GUARDS
 * Functions to check and narrow entity types at runtime.
 * These are generic functions that work with any hierarchy instance.
 ******************************************************************************/

/**
 * Get roles for a context entity.
 * Delegates to hierarchy.getRoles().
 */
export function getContextRoles<TRoles extends { all: readonly string[] }>(
  hierarchy: EntityHierarchy<TRoles, string, string, string>,
  contextType: string,
): readonly string[] {
  return hierarchy.getRoles(contextType);
}

/**
 * Check if entity type is a context entity (type guard).
 */
export function isContextEntity<TContexts extends string>(
  hierarchy: EntityHierarchy<{ all: readonly string[] }, TContexts, string, string>,
  entityType: string,
): entityType is TContexts {
  return hierarchy.isContext(entityType);
}

/**
 * Check if entity type is a product entity (type guard).
 * All product entities support realtime sync and offline transactions.
 */
export function isProductEntity<TProducts extends string>(
  hierarchy: EntityHierarchy<{ all: readonly string[] }, string, TProducts, string>,
  entityType: string | null | undefined,
): entityType is TProducts {
  return !!entityType && hierarchy.isProduct(entityType);
}

/**
 * Check if entity type is a public product entity (no parent context).
 */
export function isPublicProductEntity<TParentless extends string>(
  hierarchy: EntityHierarchy<{ all: readonly string[] }, string, string, TParentless>,
  entityType: string,
): entityType is TParentless {
  return (hierarchy.parentlessProductTypes as readonly string[]).includes(entityType);
}
