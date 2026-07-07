import type { EntityType } from '../../types';

/**
 * Naming conventions shared by the backend (drizzle source of truth) and the standalone yjs
 * relay, which builds in isolation without backend drizzle tables. Physical names are derived
 * from logical keys/entity types via drizzle's `snakeCase.table(...)` casing and pluralized
 * table names; a backend test asserts these helpers match every live table/column.
 *
 * Physical column name for a drizzle JS key (mirrors `snakeCase` casing). e.g. `createdBy` → `created_by`.
 */
export const toColumnName = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Physical table name for an entity/resource type (drizzle convention: `type + 's'`). e.g. `task` → `tasks`. */
export const toTableName = (entityType: EntityType | string): string => `${entityType}s`;
