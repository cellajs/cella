import { getColumns, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import { usersTable } from '#/modules/user/user-db';
import { userMinimalBaseSchema } from '#/schemas/minimal-base';
import { pick } from '#/utils/pick';

export type UserMinimalBase = z.infer<typeof userMinimalBaseSchema>;

export const createdByUser = alias(usersTable, 'created_by_user');
export const updatedByUser = alias(usersTable, 'updated_by_user');

// Minimal-user columns minus entityType (added as a SQL literal); derived so this tracks userMinimalBaseSchema.
type AuditUserColumnKey = Exclude<keyof typeof userMinimalBaseSchema.shape, 'entityType'>;
const selectKeys = (Object.keys(userMinimalBaseSchema.shape) as (keyof typeof userMinimalBaseSchema.shape)[]).filter(
  (key): key is AuditUserColumnKey => key !== 'entityType',
);

/** The users columns of a minimal user, without the `entityType` literal. */
export const userMinimalColumns = pick(getColumns(usersTable), selectKeys);

/** entityType is a SQL literal 'user' to preserve the literal type. */
const buildAuditUserSelect = (aliasedTable: typeof createdByUser | typeof updatedByUser) => ({
  ...pick(getColumns(aliasedTable), selectKeys),
  entityType: sql<'user'>`'user'`,
});

export const auditUserSelect = { createdBy: buildAuditUserSelect(createdByUser), updatedBy: buildAuditUserSelect(updatedByUser) };

/** Accepts both nullable (LEFT JOIN) and non-nullable shapes for audit user fields. */
type LooseAuditUser = { [K in keyof UserMinimalBase]: UserMinimalBase[K] | null };
type RawAuditRow = { createdBy: LooseAuditUser; updatedBy: LooseAuditUser };

/** Entity with audit user fields resolved to full objects (or null). */
export type WithAuditUsers<T> = Omit<T, 'createdBy' | 'updatedBy'> & { createdBy: UserMinimalBase | null; updatedBy: UserMinimalBase | null };

export function coalesceAuditUsers<T extends RawAuditRow>(rows: T[]): WithAuditUsers<T>[] {
  return rows.map(({ createdBy, updatedBy, ...rest }) => ({
    ...(rest as Omit<T, 'createdBy' | 'updatedBy'>),
    createdBy: createdBy?.id ? (createdBy as UserMinimalBase) : null,
    updatedBy: updatedBy?.id ? (updatedBy as UserMinimalBase) : null,
  }));
}

export const toUserMinimalBase = (user: Pick<UserMinimalBase, 'id' | 'name' | 'slug' | 'thumbnailUrl'>): UserMinimalBase => ({
  ...user,
  entityType: 'user',
});
