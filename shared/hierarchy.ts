/**
 * Entity hierarchy and role registry definitions.
 * Separated from default-config.ts to enable type inference before config object creation.
 */
import { createEntityHierarchy, createRoleRegistry } from './src/builder/entity-hierarchy';

/******************************************************************************
 * ROLE REGISTRY
 ******************************************************************************/

/**
 * Single source of truth for all entity roles used in memberships and permissions.
 */
export const roles = createRoleRegistry(['admin', 'member'] as const);

/******************************************************************************
 * ENTITY HIERARCHY
 ******************************************************************************/

/**
 * Entity relationships with single-parent inheritance.
 * Parents are defined before children. Order determines ancestor chain.
 */
export const hierarchy = createEntityHierarchy(roles)
  .user()
  .context('organization', { parent: null, roles: roles.all })
  .product('attachment', { parent: 'organization' })
  .product('page', { parent: null })
  .build();

/******************************************************************************
 * INFERRED TYPES FROM HIERARCHY
 ******************************************************************************/

/** Product entities with parent: null - these MUST be declared in publicProductEntityTypes */
export type ParentlessProductTypes = (typeof hierarchy.parentlessProductTypes)[number];

/** The exact tuple type required for publicProductEntityTypes - enforces all parentless products are declared */
export type RequiredPublicProductEntityTypes = typeof hierarchy.parentlessProductTypes;

/**
 * Compile-time validation helper: checks that TDeclared contains all TRequired types.
 * Returns TDeclared if valid, otherwise returns a descriptive error type.
 */
export type ValidatePublicProducts<
  TDeclared extends readonly string[],
  TRequired extends readonly string[] = typeof hierarchy.parentlessProductTypes,
> = TRequired[number] extends TDeclared[number]
  ? TDeclared
  : `Error: publicProductEntityTypes must include all parentless products: ${Exclude<TRequired[number], TDeclared[number]>}`;
