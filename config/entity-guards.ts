import { hierarchy } from './default';
import type { ContextEntityType, ProductEntityType } from './index';

/******************************************************************************
 * ENTITY TYPE GUARDS
 * Functions to check and narrow entity types at runtime.
 ******************************************************************************/

/**
 * Get roles for a context entity.
 * Delegates to hierarchy.getRoles().
 */
export function getContextRoles(contextType: string): readonly string[] {
  return hierarchy.getRoles(contextType);
}

/**
 * Check if entity type is a context entity (type guard).
 */
export function isContextEntity(entityType: string): entityType is ContextEntityType {
  return hierarchy.isContext(entityType);
}

/**
 * Check if entity type is a product entity (type guard).
 * All product entities support realtime sync and offline transactions.
 */
export function isProductEntity(entityType: string | null | undefined): entityType is ProductEntityType {
  return !!entityType && hierarchy.isProduct(entityType);
}
