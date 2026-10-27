import { and, eq, inArray } from 'drizzle-orm';
import type { EntityRole } from 'shared';
import type { DbContext } from '#/core/context';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { type SystemRoleModel, systemRolesTable } from '#/modules/system/system-roles-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';

interface FindVerifiedEmailsOpts {
  emails: string[];
}

/** The addresses among `emails` an account has verified. */
export const findVerifiedEmails = async (ctx: DbContext, { emails }: FindVerifiedEmailsOpts) => {
  return ctx.var.db.select({ email: emailsTable.email }).from(emailsTable).where(inArray(emailsTable.email, emails));
};

interface FindUsersByIdsOpts {
  ids: string[];
}

/** The ids among `ids` that name a user. */
export const findUsersByIds = async (ctx: DbContext, { ids }: FindUsersByIdsOpts) => {
  return ctx.var.db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.id, ids));
};

/** Deletes the user rows; `deleteAccounts` clears what else an account holds. */
export const deleteUsersByIds = async (ctx: DbContext, { ids }: FindUsersByIdsOpts) => {
  return ctx.var.db.delete(usersTable).where(inArray(usersTable.id, ids));
};

interface UpdateUserOpts {
  id: string;
  values: Partial<typeof usersTable.$inferInsert>;
}

/** Writes `values` to one user; returns the updated row, undefined when no user has `id`. */
export const updateUser = async (ctx: DbContext, { id, values }: UpdateUserOpts) => {
  const [updated] = await ctx.var.db.update(usersTable).set(values).where(eq(usersTable.id, id)).returning();
  return updated;
};

interface FindNewsletterRecipientsOpts {
  organizationIds: string[];
  roles: EntityRole[];
}

/** Members of the organizations who hold one of `roles` and take the newsletter: one row per user, however many of the organizations they belong to. */
export const findNewsletterRecipients = async (ctx: DbContext, { organizationIds, roles }: FindNewsletterRecipientsOpts) => {
  return ctx.var.db
    .selectDistinct({ userId: usersTable.id, email: usersTable.email, name: usersTable.name })
    .from(membershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, membershipsTable.userId))
    .where(
      and(
        eq(membershipsTable.channelType, 'organization'),
        inArray(membershipsTable.organizationId, organizationIds),
        inArray(membershipsTable.role, roles),
        eq(usersTable.newsletter, true),
      ),
    );
};

interface FindSystemRoleOpts {
  userId: string;
  role: SystemRoleModel['role'];
}

/** The user's system role row when they hold `role`; undefined otherwise. */
export const findSystemRole = async (ctx: DbContext, { userId, role }: FindSystemRoleOpts) => {
  const [row] = await ctx.var.db
    .select({ role: systemRolesTable.role })
    .from(systemRolesTable)
    .where(and(eq(systemRolesTable.userId, userId), eq(systemRolesTable.role, role)))
    .limit(1);
  return row;
};

interface FindSystemRoleHoldersOpts {
  userIds: string[];
  role: SystemRoleModel['role'];
}

/** Which of these users hold `role`. */
export const findSystemRoleHolders = async (ctx: DbContext, { userIds, role }: FindSystemRoleHoldersOpts) => {
  return ctx.var.db
    .select({ userId: systemRolesTable.userId })
    .from(systemRolesTable)
    .where(and(inArray(systemRolesTable.userId, userIds), eq(systemRolesTable.role, role)));
};
