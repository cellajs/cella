import { eq, getColumns, type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { appConfig, type UserFlags } from 'shared';
import type { UserId } from '#/db/utils/ids';
import { actorsTable } from '#/modules/actors/actors-db';
import { emailsTable } from '#/modules/user/emails-db';
import { userMinimalColumnKeys } from '#/modules/user/helpers/user-minimal';
import { type UserModel, usersTable } from '#/modules/user/user-db';
import { userBaseSchema } from '#/schemas/user-schema-base';
import { pick } from '#/utils/pick';

/** User with the activity times its `actors` row holds and its userFlags merged with the defaults. */
export type UserWithActivity = UserModel & { userFlags: UserFlags; lastSeenAt: string | null; lastSignInAt: string | null };

/** User as the API serves it: {@link UserWithActivity} with the proven address or null, and whether the account is anonymous. */
export type ServedUser = Omit<UserWithActivity, 'email'> & { email: string | null; isAnonymous: boolean };

/**
 * Joins a user's `actors` row, which holds the activity times. Every query that selects {@link userSelect} or
 * {@link memberSelect} needs it: without the join Postgres refuses the query.
 */
export const userActorJoin = eq(actorsTable.id, usersTable.id);

/** `EXISTS` on a proven address of the user `userId` names: what sets an account with an identity apart from an anonymous one (a demo's, a sample's). */
export const hasProvenEmail = (userId: AnyPgColumn<{ data: UserId }>): SQL =>
  sql`EXISTS (SELECT 1 FROM ${emailsTable} WHERE ${emailsTable.userId} = ${userId})`;

/** The address as the API serves it: the proven one, else null. An anonymous account's placeholder leaves the server for nothing. */
const provenEmail = sql<string | null>`CASE WHEN ${hasProvenEmail(usersTable.id)} THEN ${usersTable.email} END`;

const isAnonymous = sql<boolean>`NOT ${hasProvenEmail(usersTable.id)}`;

const { userFlags: _userFlags, ...userColumns } = getColumns(usersTable);

/**
 * The row as the server's own flows read it (a sign-in, a mail), the address as stored: merges userFlags with the
 * defaults; the activity times come from `actors` ({@link userActorJoin}), outside CDC.
 */
export const userSelect = {
  ...userColumns,
  userFlags: sql<UserFlags>`${JSON.stringify(appConfig.defaultUserFlags)}::jsonb || ${usersTable.userFlags}`,
  lastSeenAt: actorsTable.lastSeenAt,
  lastSignInAt: actorsTable.lastSignInAt,
};

/** {@link userSelect} as the API serves a full user: the proven address or null, and `isAnonymous`. */
export const servedUserSelect = { ...userSelect, email: provenEmail, isAnonymous };

/** Sort key for "last seen": never-seen users sort as oldest, since a plain DESC puts nulls first in Postgres. */
export const lastSeenOrder = sql`COALESCE(${actorsTable.lastSeenAt}, '-infinity')`;

const userBaseSelect = pick(getColumns(usersTable), Object.keys(userBaseSchema.shape) as (keyof typeof userBaseSchema.shape)[]);

/** Limited to userBaseSelect columns plus lastSeenAt, for cross-tenant user endpoints and member lists; needs {@link userActorJoin}. */
export const memberSelect = { ...userBaseSelect, email: provenEmail, lastSeenAt: actorsTable.lastSeenAt };

/**
 * The minimal user columns, for createdBy/updatedBy; entityType is added as a SQL literal in joins.
 * @public
 */
export const userMinimalBaseSelect = pick(getColumns(usersTable), userMinimalColumnKeys);
