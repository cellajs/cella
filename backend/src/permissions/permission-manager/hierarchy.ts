import {
  appConfig,
  type ContextEntityType,
  type EntityType,
  getContextRoles as getContextRolesFromConfig,
  getEntityAncestors,
  isContextEntity as isContextEntityFromConfig,
  isProductEntity as isProductEntityFromConfig,
  type ProductEntityType,
} from 'config';

/** Cache for ancestor context lookups (hierarchy is immutable after setup). */
const ancestorCache = new Map<string, ContextEntityType[]>();

// Note: createContext, createProduct, and createHierarchy have been removed.
// Entity hierarchy is now defined in appConfig.entityConfig.

/**
 * Gets all ancestor context types for a given entity.
 * Uses appConfig.entityConfig as the source of truth.
 * Results are cached since config is immutable.
 *
 * @param entityType - The entity type to get ancestors for.
 * @returns Array of ancestor context types (includes direct parents and their ancestors).
 */
export const getAncestorContexts = (entityType: string): ContextEntityType[] => {
  const cached = ancestorCache.get(entityType);
  if (cached) return cached;

  const directAncestors = getEntityAncestors(entityType);
  const allAncestors = new Set<string>(directAncestors);

  // Recursively collect ancestors of parents
  for (const ancestor of directAncestors) {
    const parentAncestors = getAncestorContexts(ancestor);
    for (const a of parentAncestors) {
      allAncestors.add(a);
    }
  }

  // Filter to only context entities
  const result = [...allAncestors].filter((a): a is ContextEntityType =>
    appConfig.contextEntityTypes.includes(a as ContextEntityType),
  );

  ancestorCache.set(entityType, result);
  return result;
};

/**
 * Gets the roles defined for a context entity type.
 *
 * @param contextType - The context entity type.
 * @returns Array of role names, or empty array if not a context.
 */
export const getContextRoles = (contextType: ContextEntityType): readonly string[] => {
  return getContextRolesFromConfig(contextType);
};

/**
 * Checks if an entity type is a context entity.
 *
 * @param entityType - The entity type to check.
 * @returns True if the entity is a context entity.
 */
export const isContextEntity = (entityType: EntityType): entityType is ContextEntityType => {
  return isContextEntityFromConfig(entityType);
};

/**
 * Checks if an entity type is a product entity.
 *
 * @param entityType - The entity type to check.
 * @returns True if the entity is a product entity.
 */
export const isProductEntity = (entityType: EntityType): entityType is ProductEntityType => {
  return isProductEntityFromConfig(entityType);
};
