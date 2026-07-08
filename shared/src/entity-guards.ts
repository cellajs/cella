import { hierarchy } from '../config/config.default';
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

