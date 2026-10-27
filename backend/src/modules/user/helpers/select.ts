import { eq, getColumns, sql } from 'drizzle-orm';
import { appConfig, type UserFlags } from 'shared';
import { actorsTable } from '#/modules/actors/actors-db';
import { userMinimalColumnKeys } from '#/modules/user/helpers/user-minimal';
import { type UserModel, usersTable } from '#/modules/user/user-db';
import { userBaseSchema } from '#/schemas/user-schema-base';
import { pick } from '#/utils/pick';

/** User with the activity times its `actors` row holds. */
export type UserWithActivity = UserModel & { lastSeenAt: string | null; lastSignInAt: string | null };

/**
 * Joins a user's `actors` row, which holds the activity times. Every query that selects {@link userSelect} or
 * {@link memberSelect} needs it: without the join Postgres refuses the query.
 */
export const userActorJoin = eq(actorsTable.id, usersTable.id);

const { userFlags: _userFlags, ...userColumns } = getColumns(usersTable);

/** Merges userFlags with the defaults; the activity times come from `actors` ({@link userActorJoin}), outside CDC. */
export const userSelect = {
  ...userColumns,
  userFlags: sql<UserFlags>`${JSON.stringify(appConfig.defaultUserFlags)}::jsonb || ${usersTable.userFlags}`,
  lastSeenAt: actorsTable.lastSeenAt,
  lastSignInAt: actorsTable.lastSignInAt,
};

/** Sort key for "last seen": never-seen users sort as oldest, since a plain DESC puts nulls first in Postgres. */
export const lastSeenOrder = sql`COALESCE(${actorsTable.lastSeenAt}, '-infinity')`;

const userBaseSelect = pick(getColumns(usersTable), Object.keys(userBaseSchema.shape) as (keyof typeof userBaseSchema.shape)[]);

/** Limited to userBaseSelect columns plus lastSeenAt, for cross-tenant user endpoints and member lists; needs {@link userActorJoin}. */
export const memberSelect = { ...userBaseSelect, lastSeenAt: actorsTable.lastSeenAt };

/**
 * The minimal user columns, for createdBy/updatedBy; entityType is added as a SQL literal in joins.
 * @public
 */
export const userMinimalBaseSelect = pick(getColumns(usersTable), userMinimalColumnKeys);
