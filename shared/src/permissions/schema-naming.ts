import type { EntityType } from '../../types';

/**
 * Schema-naming conventions shared by the backend (drizzle source of truth) and the standalone yjs
 * relay (which can't import backend drizzle tables — it builds in isolation with only `shared/`).
 *
 * The backend uses drizzle's `snakeCase.table(...)` casing and pluralized table names, so physical
 * names are fully derivable from logical keys/entity types. A backend test
 * (`schema-naming-conventions.test.ts`) asserts these helpers match every live drizzle table/column,
 * so a fork that breaks the convention fails CI rather than silently denying edits.
 */

/** Physical column name for a drizzle JS key (mirrors `snakeCase` casing). e.g. `createdBy` → `created_by`. */
export const toColumnName = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Physical table name for an entity/resource type (drizzle convention: `type + 's'`). e.g. `task` → `tasks`. */
export const toTableName = (entityType: EntityType | string): string => `${entityType}s`;
