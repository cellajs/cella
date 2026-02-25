import { pgTable, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { nanoid } from 'shared/nanoid';
import { usersTable } from '#/db/schema/users';
import { maxLength } from '#/db/utils/constraints';
import { timestampColumns } from '#/db/utils/timestamp-columns';

const roleEnum = appConfig.systemRoles;

export const systemRolesTable = pgTable('system_roles', {
  id: varchar({ length: maxLength.id }).primaryKey().$defaultFn(nanoid),
  userId: varchar({ length: maxLength.id })
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  role: varchar({ enum: roleEnum }).notNull(),
  createdAt: timestampColumns.createdAt,
  modifiedAt: timestampColumns.modifiedAt,
});

export type SystemRoleModel = typeof systemRolesTable.$inferSelect;
export type InsertSystemRoleModel = typeof systemRolesTable.$inferInsert;
