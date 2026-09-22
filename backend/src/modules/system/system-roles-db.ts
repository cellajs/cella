import { snakeCase, uuid, varchar } from 'drizzle-orm/pg-core';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import type { UserId } from '#/db/utils/ids';
import { timestampColumns } from '#/db/utils/timestamp-columns';
import { usersTable } from '#/modules/user/user-db';

const roleEnum = appConfig.systemRoles;

export const systemRolesTable = snakeCase.table('system_roles', {
  id: uuid().primaryKey().$defaultFn(generateId),
  userId: uuid()
    .notNull()
    .unique()
    .references(() => usersTable.id, { onDelete: 'cascade' })
    .$type<UserId>(),
  role: varchar({ enum: roleEnum }).notNull(),
  createdAt: timestampColumns.createdAt,
  updatedAt: timestampColumns.updatedAt,
});

export type SystemRoleModel = typeof systemRolesTable.$inferSelect;
export type InsertSystemRoleModel = typeof systemRolesTable.$inferInsert;
