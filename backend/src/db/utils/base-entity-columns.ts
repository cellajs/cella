import { varchar } from 'drizzle-orm/pg-core';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

/**
 * Creates base columns shared by all entities (users, context entities, product entities).
 * Contains id, entityType, name, description, createdAt, and modifiedAt.
 */
export const baseEntityColumns = <T extends string>(entityType: T) => ({
  // Created at on top to have it as first column in the table
  createdAt: timestampColumns.createdAt,
  // Identity
  id: varchar().primaryKey().$defaultFn(nanoid),
  entityType: varchar({ enum: [entityType] })
    .notNull()
    .default(entityType),
  // Metadata
  name: varchar().notNull(),
  description: varchar(),
  // Modification tracking
  modifiedAt: timestampColumns.modifiedAt,
});
