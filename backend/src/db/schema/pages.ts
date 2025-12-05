import { AnyPgColumn, doublePrecision, pgTable, unique, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const pageStatusEnum = ['unpublished', 'published', 'archived'] as const;

/**
 * Pages table.
 */
export const pagesTable = pgTable(
  'pages',
  {
    createdAt: timestampColumns.createdAt,
    id: varchar().primaryKey().$defaultFn(nanoid),
    entityType: varchar({ enum: ['page'] })
      .notNull()
      .default('page'),
    name: varchar().notNull().default('New page'),
    description: varchar().notNull(),

    keywords: varchar().notNull(),
    status: varchar({ enum: pageStatusEnum }).notNull().default('unpublished'),
    parentId: varchar().references((): AnyPgColumn => pagesTable.id, {
      onDelete: 'set null',
    }),
    displayOrder: doublePrecision().notNull(),
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
  (table) => [unique('group_order').on(table.parentId, table.displayOrder)],
);
