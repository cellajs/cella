import { and, eq, getColumns, isNotNull, isNull, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import type { DbContext, UserContext } from '#/core/context';
import { actorsTable } from '#/modules/actors/actors-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { userActorJoin, userSelect } from '#/modules/user/helpers/select';
import { usersTable } from '#/modules/user/user-db';
import { channelBaseSchema } from '#/schemas/entity-base';
import { getEntityTable } from '#/tables';
import { pick } from '#/utils/pick';

/** Select the current user with the activity times of its `actors` row. */
export const findCurrentUser = async (ctx: UserContext) => {
  const { db, userId } = ctx.var;
  const [user] = await db.select(userSelect).from(usersTable).innerJoin(actorsTable, userActorJoin).where(eq(usersTable.id, userId)).limit(1);
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
    ...(userFlags && { userFlags: sql`${usersTable.userFlags} || ${JSON.stringify(userFlags)}::jsonb` }),
  };

  return db.update(usersTable).set(updateData).where(eq(usersTable.id, userId));
};

interface DeleteMyMembershipOpts {
  channelId: string;
}

export const deleteMyMembership = async (ctx: UserContext, { channelId }: DeleteMyMembershipOpts) => {
  const { db, userId } = ctx.var;
  return db.delete(membershipsTable).where(and(eq(membershipsTable.userId, userId), eq(membershipsTable.channelId, channelId)));
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
        .select({ entity: channelBaseSelect, inactiveMembership: inactiveMembershipsTable })
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
