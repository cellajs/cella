import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { EntityRole } from 'shared';
import type { DbContext } from '#/core/context';
import { tokensTable } from '#/modules/auth/tokens-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { emailsTable } from '#/modules/user/emails-db';
import { unsubscribeTokensTable } from '#/modules/user/unsubscribe-tokens-db';
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

interface FindPendingInvitationTokensOpts {
  emails: string[];
}

export const findPendingInvitationTokens = async (ctx: DbContext, { emails }: FindPendingInvitationTokensOpts) => {
  const { db } = ctx.var;
  return db
    .select({
      id: tokensTable.id,
      email: tokensTable.email,
      expiresAt: tokensTable.expiresAt,
      invokedAt: tokensTable.invokedAt,
    })
    .from(tokensTable)
    .where(
      and(
        inArray(tokensTable.email, emails),
        eq(tokensTable.type, 'invitation'),
        isNull(tokensTable.inactiveMembershipId),
        isNull(tokensTable.invokedAt),
      ),
    );
};

interface InsertTokensOpts {
  tokens: (typeof tokensTable.$inferInsert)[];
}

export const insertTokens = async (ctx: DbContext, { tokens }: InsertTokensOpts) => {
  const { db } = ctx.var;
  return db.insert(tokensTable).values(tokens).returning();
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

export const findNewsletterRecipients = async (
  ctx: DbContext,
  { organizationIds, roles }: FindNewsletterRecipientsOpts,
) => {
  const { db } = ctx.var;
  return db
    .selectDistinct({
      email: usersTable.email,
      name: usersTable.name,
      unsubscribeToken: unsubscribeTokensTable.secret,
      newsletter: usersTable.newsletter,
      orgName: organizationsTable.name,
    })
    .from(membershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, membershipsTable.userId))
    .innerJoin(unsubscribeTokensTable, eq(usersTable.id, unsubscribeTokensTable.userId))
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
