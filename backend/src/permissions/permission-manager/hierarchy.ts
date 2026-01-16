import type { ContextEntityType, EntityRole, EntityType, ProductEntityType } from 'config';
import type { ContextConfig, HierarchyConfig, ProductConfig } from './types';

/** Cache for ancestor context lookups (hierarchy is immutable after setup). */
const ancestorCache = new Map<string, ContextEntityType[]>();

/**
 * Creates a context entity configuration.
 *
 * @param roles - Roles available for this context (e.g., ['admin', 'member']).
 * @param parents - Parent context entities (for hierarchical permission inheritance).
 * @returns Context entity configuration.
 */
export const createContext = (roles: readonly EntityRole[], parents?: readonly ContextEntityType[]): ContextConfig => ({
  type: 'context',
  roles,
  parents,
});

/**
 * Creates a product entity configuration.
 *
 * @param parents - Parent context entities that this product belongs to.
 * @returns Product entity configuration.
 */
export const createProduct = (parents: readonly ContextEntityType[]): ProductConfig => ({
  type: 'product',
  parents,
});

/**
 * Creates a type-safe hierarchy configuration from entity configs.
 * This is a simple identity function that provides type checking.
 *
 * @param config - The hierarchy configuration object.
 * @returns The same configuration with proper typing.
 */
export const createHierarchy = <T extends HierarchyConfig>(config: T): T => config;

/**
 * Gets all ancestor context types for a given entity in the hierarchy.
 * Traverses the parent chain to collect all contexts that can grant permissions.
 * Results are cached since hierarchy is immutable after setup.
 *
 * @param hierarchy - The hierarchy configuration.
 * @param entityType - The entity type to get ancestors for (context or product).
 * @returns Array of ancestor context types (includes direct parents and their ancestors).
 */
export const getAncestorContexts = (
  hierarchy: HierarchyConfig,
  entityType: ContextEntityType | ProductEntityType,
): ContextEntityType[] => {
  const cached = ancestorCache.get(entityType);
  if (cached) return cached;

  const config = hierarchy[entityType];
  if (!config) {
    ancestorCache.set(entityType, []);
    return [];
  }

  const parents = config.parents ?? [];
  const ancestors = new Set<ContextEntityType>(parents);

  // Recursively collect ancestors of parents
  for (const parent of parents) {
    const parentAncestors = getAncestorContexts(hierarchy, parent);
    for (const ancestor of parentAncestors) {
      ancestors.add(ancestor);
    }
  }

  const result = Array.from(ancestors);
  ancestorCache.set(entityType, result);
  return result;
};

/**
 * Gets the roles defined for a context entity type.
 *
 * @param hierarchy - The hierarchy configuration.
 * @param contextType - The context entity type.
 * @returns Array of role names, or empty array if not a context.
 */
export const getContextRoles = (hierarchy: HierarchyConfig, contextType: ContextEntityType): readonly EntityRole[] => {
  const config = hierarchy[contextType];
  if (!config || config.type !== 'context') return [];
  return config.roles;
};

/**
 * Checks if an entity type is a context entity in the hierarchy.
 *
 * @param hierarchy - The hierarchy configuration.
 * @param entityType - The entity type to check.
 * @returns True if the entity is a context entity.
 */
export const isContextEntity = (
  hierarchy: HierarchyConfig,
  entityType: EntityType,
): entityType is ContextEntityType => {
  const config = hierarchy[entityType as ContextEntityType | ProductEntityType];
  return config?.type === 'context';
};

/**
 * Checks if an entity type is a product entity in the hierarchy.
 *
 * @param hierarchy - The hierarchy configuration.
 * @param entityType - The entity type to check.
 * @returns True if the entity is a product entity.
 */
export const isProductEntity = (
  hierarchy: HierarchyConfig,
  entityType: EntityType,
): entityType is ProductEntityType => {
  const config = hierarchy[entityType as ContextEntityType | ProductEntityType];
  return config?.type === 'product';
};
