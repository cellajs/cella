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
 * Only context entities listed here will have FK columns generated for product entities.
 * Omit entities (e.g., workspace) that shouldn't be part of the parent tree.
 *
 * ⚠️ TODO IMPORTANT: Keep in sync with `ancestors` arrays in entityConfig (config/default.ts).
 * The keys here should match entities that appear in any product entity's ancestors.
 */
export const relatableContextEntityTables = {
  organization: organizationsTable,
} as const;

/** Context entity types that can have FK columns generated (derived from relatableContextEntityTables). */
export type RelatableContextEntityType = keyof typeof relatableContextEntityTables;
