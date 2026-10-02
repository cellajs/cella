import { and, eq, inArray } from 'drizzle-orm';
import type { EntityRole } from 'shared';
import type { DbContext } from '#/core/context';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { type SystemRoleModel, systemRolesTable } from '#/modules/system/system-roles-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';

interface FindVerifiedEmailsOpts {
  emails: string[];
}

export const findVerifiedEmails = async (ctx: DbContext, { emails }: FindVerifiedEmailsOpts) => {
  const { db } = ctx.var;
  return db
    .select({ email: emailsTable.email })
    .from(emailsTable)
    .where(and(inArray(emailsTable.email, emails), eq(emailsTable.verified, true)));
};

interface FindUsersByIdsOpts {
  ids: string[];
}

export const findUsersByIds = async (ctx: DbContext, { ids }: FindUsersByIdsOpts) => {
  const { db } = ctx.var;
  return db.select({ id: usersTable.id }).from(usersTable).where(inArray(usersTable.id, ids));
};

export const deleteUsersByIds = async (ctx: DbContext, { ids }: FindUsersByIdsOpts) => {
  const { db } = ctx.var;
  return db.delete(usersTable).where(inArray(usersTable.id, ids));
};

interface UpdateUserOpts {
  id: string;
  values: Partial<typeof usersTable.$inferInsert>;
}

export const updateUser = async (ctx: DbContext, { id, values }: UpdateUserOpts) => {
  const { db } = ctx.var;
  const [updated] = await db.update(usersTable).set(values).where(eq(usersTable.id, id)).returning();
  return updated;
};

interface FindNewsletterRecipientsOpts {
  organizationIds: string[];
  roles: EntityRole[];
}

export const findNewsletterRecipients = async (ctx: DbContext, { organizationIds, roles }: FindNewsletterRecipientsOpts) => {
  const { db } = ctx.var;
  return db
    .selectDistinct({ userId: usersTable.id, email: usersTable.email, name: usersTable.name, orgName: organizationsTable.name })
    .from(membershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, membershipsTable.userId))
    .innerJoin(organizationsTable, eq(organizationsTable.id, membershipsTable.organizationId))
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
