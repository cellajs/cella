import type { z } from '@hono/zod-openapi';
import type { Env, OrgContext } from '#/core/context';
import { AppError } from '#/core/error';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { ltiRolesIn } from '#/modules/lti-platform/helpers/lti-roles';
import { releasedClaims } from '#/modules/lti-platform/helpers/platform-offer';
import { findLtiMembersPage } from '#/modules/lti-platform/lti-platform-queries';
import type { listLtiMembersQuerySchema } from '#/modules/lti-platform/lti-platform-schema';
import { findMembershipsByUserIds } from '#/modules/memberships/memberships-queries';
import { accessFrom } from '#/permissions/access';
import { assertReadsPeople } from '#/permissions/visible-people';
import type { PageWindow } from '#/utils/list-page';

type LtiToolContext = { var: OrgContext['var'] & Pick<Env['Variables'], 'ltiInstallation'> };

/**
 * A page of the people of a course an installed LTI tool is placed in or below, for its own token. The course must be
 * one its placements imply a binding on (`ltiToolGuard`); whom it sees there is what that binding reads
 * (`assertReadsPeople`), masked by the token. Each row carries the person's id, their LTI roles in the course and the
 * personal claims a launch would carry, as a launch decides them.
 * @throws AppError 404 `not_found` with the channel's `entityType` for a channel that is no such course, as for any
 *   channel the caller may not read; 403 `forbidden` (`entityType: 'user'`) when the binding or the token's scopes read
 *   no people there.
 */
export async function getLtiMembersOp(
  ctx: LtiToolContext,
  { channelType, channelId, orderBy }: z.infer<typeof listLtiMembersQuerySchema>,
  { offset, limit }: PageWindow,
) {
  const { actor, organizationId, ltiInstallation } = ctx.var;
  const missing = () => new AppError(404, 'not_found', 'warn', { entityType: channelType });
  if (!actor.bindings.some((binding) => binding.channelType === channelType && binding.channelId === channelId)) throw missing();
  const channel = await resolveEntity(ctx, { entityType: channelType, identifier: channelId });
  if (!channel) throw missing();
  assertReadsPeople(ctx, channelType, channel);

  const page = { organizationId, channelType, channelId: channel.id, order: orderBy.order, offset, limit };
  const { items, total } = await findLtiMembersPage(ctx, page);
  const memberships = await findMembershipsByUserIds(ctx, { userIds: items.map((person) => person.id), organizationId });
  const { installation, client } = ltiInstallation;
  const rows = items.map((person) => {
    const bindings = memberships.filter((membership) => membership.userId === person.id);
    const access = accessFrom({ var: { actor: { id: person.id, bindings, scopes: null }, isSystemAdmin: false } });
    return {
      id: person.id,
      roles: ltiRolesIn(access, channelType, channel),
      ...releasedClaims(installation.releasedFields, client.ltiToolConfig.claims, person),
    };
  });
  return { items: rows, total };
}
