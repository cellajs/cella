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
