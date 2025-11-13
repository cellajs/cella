import { appConfig } from 'config';
import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { usersTable } from '#/db/schema/users';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { nanoid } from '#/utils/nanoid';

const roleEnum = appConfig.roles.systemRoles;

export const systemRolesTable = pgTable('system_roles', {
  id: varchar().primaryKey().$defaultFn(nanoid),
  userId: varchar()
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar({ enum: roleEnum }).notNull(),
  createdAt: timestampColumns.createdAt,
  modifiedAt: timestampColumns.modifiedAt,
});

export type SystemRoleModel = typeof systemRolesTable.$inferSelect;
export type InsertSystemRoleModel = typeof systemRolesTable.$inferInsert;
