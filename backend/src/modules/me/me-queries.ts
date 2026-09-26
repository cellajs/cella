import { and, eq, getColumns, isNotNull, isNull, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { DbContext, UserContext } from '#/core/context';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { userSelect } from '#/modules/user/helpers/select';
import { unsubscribeTokensTable } from '#/modules/user/unsubscribe-tokens-db';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { usersTable } from '#/modules/user/user-db';
import { channelBaseSchema } from '#/schemas/entity-base';
import { getEntityTable } from '#/tables';
import { hashToken } from '#/utils/hash-token';
import { pick } from '#/utils/pick';

interface UpsertLastStartedOpts {
  lastStartedAt: string;
}

/** Upsert the lastStartedAt counter for a user (avoids CDC noise on users table). */
export const upsertLastStarted = async (ctx: UserContext, { lastStartedAt }: UpsertLastStartedOpts) => {
  const { db, userId } = ctx.var;
  return db.insert(userCountersTable).values({ userId, lastStartedAt }).onConflictDoUpdate({
    target: userCountersTable.userId,
    set: { lastStartedAt },
  });
};

/** Select a user by ID with activity timestamps (from user_counters). */
export const findCurrentUser = async (ctx: UserContext) => {
  const { db, userId } = ctx.var;
  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user;
};

interface UpdateUserMfaOpts {
  mfaRequired: boolean;
}

/** Sets the MFA flag; the caller ends the sessions that enabling it replaces. */
export const updateUserMfa = async (ctx: UserContext, { mfaRequired }: UpdateUserMfaOpts) => {
  const { db, userId } = ctx.var;
  const [updatedUser] = await db.update(usersTable).set({ mfaRequired }).where(eq(usersTable.id, userId)).returning();
  return updatedUser;
};

export interface UpdateMeOpts {
  values: Partial<typeof usersTable.$inferInsert> & { userFlags?: { finishedOnboarding?: boolean } };
}

/** Update current user. Merges userFlags via jsonb || if provided. */
export const updateMe = async (ctx: UserContext, { values }: UpdateMeOpts) => {
  const { db, userId } = ctx.var;
  const { userFlags, ...rest } = values;

  const updateData = {
    ...rest,
    ...(userFlags && {
      userFlags: sql`${usersTable.userFlags} || ${JSON.stringify(userFlags)}::jsonb`,
    }),
  };

  return db.update(usersTable).set(updateData).where(eq(usersTable.id, userId));
};

export const deleteUser = async (ctx: UserContext) => {
  const { db, userId } = ctx.var;
  return db.delete(usersTable).where(eq(usersTable.id, userId));
};

interface DeleteMyMembershipOpts {
  channelId: string;
}

export const deleteMyMembership = async (ctx: UserContext, { channelId }: DeleteMyMembershipOpts) => {
  const { db, userId } = ctx.var;
  return db
    .delete(membershipsTable)
    .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.channelId, channelId)));
};

interface FindUserByUnsubscribeTokenOpts {
  token: string;
}

/** The user an unsubscribe link belongs to, found by the token's hash: the table stores no token itself. */
export const findUserByUnsubscribeToken = async (ctx: DbContext, { token }: FindUserByUnsubscribeTokenOpts) => {
  const { db } = ctx.var;
  const [user] = await db
    .select(userSelect)
    .from(usersTable)
    .innerJoin(unsubscribeTokensTable, eq(usersTable.id, unsubscribeTokensTable.userId))
    .where(eq(unsubscribeTokensTable.secret, hashToken(token)))
    .limit(1);
  return user;
};

interface FindPendingInvitationsOpts {
  userId: string;
}

export const findPendingInvitations = async (ctx: DbContext, { userId }: FindPendingInvitationsOpts) => {
  const { db } = ctx.var;
  const results = await Promise.all(
    appConfig.channelEntityTypes.map((entityType) => {
      const entityTable = getEntityTable(entityType);
      const cols = getColumns(entityTable);
      const keys = Object.keys(channelBaseSchema.shape) as (keyof typeof channelBaseSchema.shape)[];
      const channelBaseSelect = pick(cols, keys);

      return db
        .select({
          entity: channelBaseSelect,
          inactiveMembership: inactiveMembershipsTable,
        })
        .from(inactiveMembershipsTable)
        .innerJoin(entityTable, eq(entityTable.id, inactiveMembershipsTable.channelId))
        .where(
          and(
            eq(inactiveMembershipsTable.channelType, entityType),
            eq(inactiveMembershipsTable.userId, userId),
            isNull(inactiveMembershipsTable.rejectedAt),
            // Invites in an unpublished context stay hidden until the context is published.
            isNotNull(cols.publishedAt),
          ),
        );
    }),
  );

  return results.flat();
};

interface UpdateNewsletterOpts {
  userId: string;
  newsletter: boolean;
}

/** Used in the unauthenticated unsubscribe flow. */
export const updateNewsletter = async (ctx: DbContext, { userId, newsletter }: UpdateNewsletterOpts) => {
  const { db } = ctx.var;
  return db.update(usersTable).set({ newsletter }).where(eq(usersTable.id, userId));
};
