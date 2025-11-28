import { AnyPgColumn, doublePrecision, pgTable, unique, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

// https://orm.drizzle.team/docs/generated-columns

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
    content: varchar().notNull(), // optional for "folders"?
    keywords: varchar().notNull(),
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
    displayOrder: doublePrecision().notNull(),
    createdAt: timestampColumns.createdAt,
    createdBy: varchar()
      .notNull()
      .references(() => usersTable.id, {
        onDelete: 'set null',
      }),
    modifiedAt: timestampColumns.modifiedAt,
    modifiedBy: varchar()
      .notNull()
      .references(() => usersTable.id, {
        onDelete: 'set null',
      }),
  },
  (table) => [
    unique('group_order').on(table.parentId, table.displayOrder),
    // index('pages_organization_id_index').on(table.organizationId),
  ],
);
