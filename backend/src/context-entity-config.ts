import { organizationsTable } from '#/db/schema/organizations';

/**
 * Mapping of context entity types to their tables for FK column generation.
 * Only context entities listed here will have FK columns generated.
 * Omit entities (e.g., workspace) that shouldn't be part of the parent tree.
 */
export const relatableContextEntityTables = {
  organization: organizationsTable,
} as const;

/** Context entity types that can have FK columns generated (derived from relatableContextEntityTables). */
export type RelatableContextEntityType = keyof typeof relatableContextEntityTables;
