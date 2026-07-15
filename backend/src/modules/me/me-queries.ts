import { and, eq, getColumns, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { AuthContext, DbContext } from '#/core/context';
import { sessionsTable } from '#/modules/auth/sessions-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { userSelect } from '#/modules/user/helpers/select';
import { unsubscribeTokensTable } from '#/modules/user/unsubscribe-tokens-db';
import { userCountersTable } from '#/modules/user/user-counters-db';
import { usersTable } from '#/modules/user/user-db';
import { channelEntityBaseSchema } from '#/schemas/entity-base';
import { getEntityTable } from '#/tables';
import { pick } from '#/utils/pick';

interface UpsertLastStartedOpts {
  lastStartedAt: string;
}

/** Upsert the lastStartedAt counter for a user (avoids CDC noise on users table). */
export const upsertLastStarted = async (ctx: AuthContext, { lastStartedAt }: UpsertLastStartedOpts) => {
  const { db, userId } = ctx.var;
  return db.insert(userCountersTable).values({ userId, lastStartedAt }).onConflictDoUpdate({
    target: userCountersTable.userId,
    set: { lastStartedAt },
  });
};

/** Select a user by ID with activity timestamps (from user_counters). */
export const findUserById = async (ctx: AuthContext) => {
  const { db, userId } = ctx.var;
  const [user] = await db.select(userSelect).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user;
};

interface UpdateUserMfaOpts {
  mfaRequired: boolean;
}

/** Update MFA flag and delete regular sessions if enabling MFA. Returns updated user. */
export const updateUserMfa = async (ctx: AuthContext, { mfaRequired }: UpdateUserMfaOpts) => {
  const { db, userId } = ctx.var;
  const [updatedUser] = await db.update(usersTable).set({ mfaRequired }).where(eq(usersTable.id, userId)).returning();

  if (updatedUser.mfaRequired) {
    await db
      .delete(sessionsTable)
      .where(and(eq(sessionsTable.userId, updatedUser.id), eq(sessionsTable.type, 'regular')));
  }

  return updatedUser;
};

interface DeleteSessionsByIdsOpts {
  sessionIds: string[];
}

/** Delete sessions by IDs for the current user. */
export const deleteSessionsByIds = async (ctx: AuthContext, { sessionIds }: DeleteSessionsByIdsOpts) => {
  const { db, userId } = ctx.var;
  return db
    .delete(sessionsTable)
    .where(and(inArray(sessionsTable.id, sessionIds), eq(sessionsTable.userId, userId)))
    .returning({ id: sessionsTable.id });
};

export interface UpdateMeOpts {
  values: Partial<typeof usersTable.$inferInsert> & { userFlags?: { finishedOnboarding?: boolean } };
}

/** Update current user. Merges userFlags via jsonb || if provided. */
export const updateMe = async (ctx: AuthContext, { values }: UpdateMeOpts) => {
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

/** Delete the current user by ID. */
export const deleteUser = async (ctx: AuthContext) => {
  const { db, userId } = ctx.var;
  return db.delete(usersTable).where(eq(usersTable.id, userId));
};

interface DeleteMyMembershipOpts {
  channelId: string;
}

/** Delete the current user's membership by channelId. */
export const deleteMyMembership = async (ctx: AuthContext, { channelId }: DeleteMyMembershipOpts) => {
  const { db, userId } = ctx.var;
  return db
    .delete(membershipsTable)
    .where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.channelId, channelId)));
};

interface FindUserByUnsubscribeTokenOpts {
  token: string;
}

/** Find a user by unsubscribe token. */
export const findUserByUnsubscribeToken = async (ctx: DbContext, { token }: FindUserByUnsubscribeTokenOpts) => {
  const { db } = ctx.var;
  const [user] = await db
    .select(userSelect)
    .from(usersTable)
    .innerJoin(unsubscribeTokensTable, eq(usersTable.id, unsubscribeTokensTable.userId))
    .where(eq(unsubscribeTokensTable.secret, token))
    .limit(1);
  return user;
};

interface FindPendingInvitationsOpts {
  userId: string;
}

/** Find pending invitations for a user across all context entity types. */
export const findPendingInvitations = async (ctx: DbContext, { userId }: FindPendingInvitationsOpts) => {
  const { db } = ctx.var;
  const results = await Promise.all(
    appConfig.channelEntityTypes.map((entityType) => {
      const entityTable = getEntityTable(entityType);
      const cols = getColumns(entityTable);
      const keys = Object.keys(channelEntityBaseSchema.shape) as (keyof typeof channelEntityBaseSchema.shape)[];
      const channelEntityBaseSelect = pick(cols, keys);

      return db
        .select({
          entity: channelEntityBaseSelect,
          inactiveMembership: inactiveMembershipsTable,
        })
        .from(inactiveMembershipsTable)
        .innerJoin(entityTable, eq(entityTable.id, inactiveMembershipsTable.channelId))
        .where(
          and(
            eq(inactiveMembershipsTable.channelType, entityType),
            eq(inactiveMembershipsTable.userId, userId),
            isNull(inactiveMembershipsTable.rejectedAt),
            // Invites against an unpublished (draft) context are deferred: hidden from the
            // invitee until the context is published and the invite is dispatched.
            isNotNull(cols.publishedAt),
          ),
        );
    }),
  );

  return results.flat();
};

/** Update a user's newsletter preference. Used in unauthenticated unsubscribe flow. */
export const updateNewsletter = async (
  ctx: DbContext,
  { userId, newsletter }: { userId: string; newsletter: boolean },
) => {
  const { db } = ctx.var;
  return db.update(usersTable).set({ newsletter }).where(eq(usersTable.id, userId));
};
