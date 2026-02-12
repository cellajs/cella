import { organizationsTable } from '#/db/schema/organizations';

/**
 * Mapping of relatable context entity types to their tables for FK column generation.
 *
 * ⚠️ IMPORTANT: Keep in sync with hierarchy in shared/default-config.ts.
 * The keys here should match context entities that appear as ancestors of any entity
 * (both context and product entities with a parent).
 */
export const relatableContextEntityTables = {
  organization: organizationsTable,
} as const;

/** Context entity types used as FK targets in entity tables (derived from relatableContextEntityTables). */
export type RelatableContextEntityType = keyof typeof relatableContextEntityTables;
