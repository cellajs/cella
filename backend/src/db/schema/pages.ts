import { AnyPgColumn, doublePrecision, pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

/**
 * Pages table.
 */
export const pagesTable = pgTable(
  'pages',
  {
    id: varchar().primaryKey().$defaultFn(nanoid),
    entityType: varchar({ enum: ['page'] })
      .notNull()
      .default('page'),
    slug: varchar().notNull().unique(),
    title: varchar().notNull(),
    content: varchar().notNull(),
    keywords: varchar().notNull(),
    // order is a reserved keyword in Postgres, so we need to use a different name
    order: doublePrecision().notNull(),
    status: varchar({ enum: ['unpublished', 'published', 'archived'] })
      .notNull()
      .default('unpublished'),
    // organizationId: varchar()
    //   .notNull()
    //   .references(() => organizationsTable.id, {
    //     onDelete: 'cascade',
    //   }),
    parentId: varchar().references((): AnyPgColumn => pagesTable.id, {
      // or inherit?
      onDelete: 'set null',
    }),
    createdAt: timestampColumns.createdAt,
    createdBy: varchar().references(() => usersTable.id, {
      onDelete: 'set null',
    }),
    modifiedAt: timestampColumns.modifiedAt,
    modifiedBy: varchar().references(() => usersTable.id, {
      onDelete: 'set null',
    }),
  },
  // (table) => [index('pages_organization_id_index').on(table.organizationId)],
);
