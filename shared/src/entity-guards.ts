/**
 * Entity type guard functions bound to the app's hierarchy.
 * Single source of truth — calls hierarchy methods directly.
 */
import { hierarchy } from '../default-config';
import type { ContextEntityType, ProductEntityType } from '../types';

/** Get roles for a context entity. */
export function getContextRoles(contextType: string): readonly string[] {
  return hierarchy.getRoles(contextType);
}

/** Check if entity type is a context entity (type guard). */
export function isContextEntity(entityType: string): entityType is ContextEntityType {
  return hierarchy.isContext(entityType);
}

/** Check if entity type is a product entity (type guard). */
export function isProductEntity(entityType: string | null | undefined): entityType is ProductEntityType {
  return !!entityType && hierarchy.isProduct(entityType);
}

/**
 * Check if entity type is a public stream entity (parentless product with publicRead).
 * These are the entity types dispatched via the unauthenticated public SSE stream.
 */
export function isPublicStreamEntity(entityType: string): boolean {
  return hierarchy.publicStreamTypes.includes(entityType as never);
}

/** Check if entity type has a parent context entity. */
export function hasParentEntity(entityType: string): boolean {
  return hierarchy.getParent(entityType) !== null;
}
