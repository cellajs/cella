import type { EntityType } from '../../types.ts';

/**
 * Naming shared by the backend (drizzle is the source of truth) and the standalone yjs relay,
 * which builds without the backend drizzle tables. A backend test asserts these helpers match
 * every live table and column. Column names mirror drizzle `snakeCase`: `createdBy` to
 * `created_by`.
 */
export const toColumnName = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Drizzle convention, snake_cased `type + 's'`: `courseSection` gives `course_sections`. */
export const toTableName = (entityType: EntityType | string): string => `${toColumnName(entityType)}s`;
