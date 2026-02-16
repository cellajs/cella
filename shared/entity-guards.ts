/**
 * Entity type guard functions bound to the app's hierarchy.
 * Wraps the generic builder guards with the concrete hierarchy instance.
 */
import { hierarchy } from './default-config';
import {
  getContextRoles as _getContextRoles,
  isContextEntity as _isContextEntity,
  isProductEntity as _isProductEntity,
  isPublicProductEntity as _isPublicProductEntity,
} from './src/builder/entity-guards';
import type { ContextEntityType, ProductEntityType } from './types';

/** Get roles for a context entity. */
export function getContextRoles(contextType: string): readonly string[] {
  return _getContextRoles(hierarchy, contextType);
}

/** Check if entity type is a context entity (type guard). */
export function isContextEntity(entityType: string): entityType is ContextEntityType {
  return _isContextEntity(hierarchy, entityType);
}

/** Check if entity type is a product entity (type guard). */
export function isProductEntity(entityType: string | null | undefined): entityType is ProductEntityType {
  return _isProductEntity(hierarchy, entityType);
}

/**
 * Check if entity type has public access configured in hierarchy.
 * This checks whether the entity CAN be public (has publicAccess config),
 * not whether a specific row IS public.
 */
export function isPublicProductEntity(entityType: string): boolean {
  return _isPublicProductEntity(hierarchy, entityType);
}
