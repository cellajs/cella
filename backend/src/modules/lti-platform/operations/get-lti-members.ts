import type { z } from '@hono/zod-openapi';
import type { OrgContext } from '#/core/context';
import { AppError } from '#/core/error';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { ltiRolesIn } from '#/modules/lti-platform/helpers/lti-roles';
import { releasedFieldValues } from '#/modules/lti-platform/helpers/platform-offer';
import { countLtiPlacements, findLtiInstallation } from '#/modules/lti-platform/lti-platform-queries';
import type { listLtiMembersQuerySchema } from '#/modules/lti-platform/lti-platform-schema';
import { findMembershipsByUserIds, findMembersPaginated } from '#/modules/memberships/memberships-queries';
import { assertReadsPeople } from '#/permissions/visible-people';
import type { PageWindow } from '#/utils/list-page';

type GetLtiMembersInput = z.infer<typeof listLtiMembersQuerySchema>;

/**
 * The channel an installation reads people of: one it is placed in, and so bound to, in the route's organization. Its
 * token may carry `user:read` alone, which reads no channel through the engine: the placement stands in for that read.
 * @throws AppError 404 `not_found` with the channel's `entityType`, as for any channel the caller may not read.
 */
async function getPlacedChannel(ctx: OrgContext, { channelType, channelId }: Pick<GetLtiMembersInput, 'channelType' | 'channelId'>) {
  const { actor, organizationId } = ctx.var;
  const missing = () => new AppError(404, 'not_found', 'warn', { entityType: channelType });
  const bound = actor.bindings.some((binding) => binding.channelId === channelId && binding.organizationId === organizationId);
  if (!bound || (await countLtiPlacements(ctx, { installationId: actor.id, channelId })) === 0) throw missing();
  const channel = await resolveEntity(ctx, { entityType: channelType, identifier: channelId });
  if (!channel) throw missing();
  return channel;
}

/**
 * A page of the people of a channel an installed LTI tool is placed in, for its own token. Each row carries the
 * person's id, their LTI roles there (`ltiRolesIn`, as a launch sends them) and only the personal fields the
 * installation releases. Whom it sees is what its own roles there read (`assertReadsPeople`), masked by the token.
 * @throws AppError 403 `forbidden` (`entityType: 'user'`) when the installation's roles or the token's scopes read no
 *   people there, and what `getPlacedChannel` throws.
 */
export async function getLtiMembersOp(ctx: OrgContext, { channelType, channelId, orderBy }: GetLtiMembersInput, { offset, limit }: PageWindow) {
  const { actor, organizationId, tenantId } = ctx.var;
  const channel = await getPlacedChannel(ctx, { channelType, channelId });
  assertReadsPeople(ctx, channelType, channel);

  const installation = await findLtiInstallation(ctx, { id: actor.id, tenantId });
  const released = installation?.installation.releasedFields ?? [];
  const { items, total } = await findMembersPaginated(ctx, { ...orderBy, organizationId, channelType, channelId: channel.id, offset, limit });

  const memberships = await findMembershipsByUserIds(ctx, { userIds: items.map((person) => person.id) });
  const rows = items.map((person) => {
    const access = { actorId: person.id, scopes: null, memberships: memberships.filter((membership) => membership.userId === person.id) };
    return { id: person.id, roles: ltiRolesIn(access, channelType, channel), ...releasedFieldValues(released, person) };
  });
  return { items: rows, total };
}
