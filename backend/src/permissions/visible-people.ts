import { inArray, or, type SQL, sql } from 'drizzle-orm';
import { type Access, buildPeopleSubject, type ChannelEntityType, type ChannelIdColumns, checkAccess } from 'shared';
import type { ActorBinding, DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { usersTable } from '#/modules/user/user-db';
import { type AccessContext, accessFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';

/**
 * Predicate on `membershipsTable`: the rows the caller may read, in `organizationIds`, else in every organization it
 * holds a binding in. A person is visible to the caller when one of their rows matches.
 */
export const readableMembershipsWhere = (access: Access<ActorBinding>, organizationIds?: string[]): SQL => {
  const bound = 'visitor' in access ? [] : access.memberships.map((membership) => membership.organizationId);
  const clauses = [...new Set(organizationIds ?? bound)].map((organizationId) =>
    buildCollectionReadWhere(resolveCollectionReadFilter(access, 'user', organizationId), membershipsTable, access, organizationId),
  );
  return or(...clauses) ?? sql`false`;
};

/**
 * Filter on `usersTable`: the caller (`userId`) and the people holding a membership row it may read, as one id list
 * Postgres plans as a semi-join. A system admin's access reads the organizations it is bound to; the user routes pass
 * no filter for one, who sees everyone.
 */
export const visibleUserFilter = (ctx: DbContext, { access, userId }: { access: Access<ActorBinding>; userId: string }): SQL => {
  const readable = ctx.var.db.select({ userId: membershipsTable.userId }).from(membershipsTable).where(readableMembershipsWhere(access));
  return inArray(usersTable.id, sql`(${readable} union select ${userId}::uuid)`);
};

/**
 * Refuses what lists or invites a channel's people (members, invitations) to a caller whose roles do not read the
 * membership rows of that channel. The caller reads the channel, so the answer is a 403.
 * @throws AppError 403 `forbidden` with `entityType: 'user'`
 */
export const assertReadsPeople = (ctx: AccessContext, channelType: ChannelEntityType, channel: { id: string } & Partial<ChannelIdColumns>) => {
  if (checkAccess(accessFrom(ctx), 'read', buildPeopleSubject(channelType, channel)).allowed) return;
  throw new AppError(403, 'forbidden', 'warn', { entityType: 'user' });
};
