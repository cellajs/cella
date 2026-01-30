import _default, { hierarchy } from './default';
import type { ContextEntityType, ProductEntityType, RealtimeEntityType } from './index';

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
 */
export function isProductEntity(entityType: string): entityType is ProductEntityType {
  return hierarchy.isProduct(entityType);
}

/**
 * Check if entity type is a realtime entity (supports SSE notifications).
 */
export function isRealtimeEntity(entityType: string | null | undefined): entityType is RealtimeEntityType {
  return !!entityType && _default.realtimeEntityTypes.includes(entityType as RealtimeEntityType);
}
