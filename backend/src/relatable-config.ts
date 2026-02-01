import type { ContextEntityType } from 'config';
import { organizationsTable } from '#/db/schema/organizations';

/**
 * Mapping of all context entity types to their tables.
 * Used for generating FK columns when mode='all' (e.g., memberships need all context entities).
 * When adding a new context entity type, add it here.
 */
export const allContextEntityTables = {
  organization: organizationsTable,
} as const satisfies Record<ContextEntityType, { id: typeof organizationsTable.id }>;

/**
 * Mapping of relatable context entity types to their tables for FK column generation.
 *
 * ⚠️ IMPORTANT: Keep in sync with hierarchy in config/default.ts.
 * The keys here should match context entities that appear as ancestors of any entity
 * (both context and product entities with a parent).
 */
export const relatableContextEntityTables = {
  organization: organizationsTable,
} as const;

/** Context entity types used as FK targets in entity tables (derived from relatableContextEntityTables). */
export type RelatableContextEntityType = keyof typeof relatableContextEntityTables;
