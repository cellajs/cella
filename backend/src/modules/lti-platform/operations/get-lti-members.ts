import type { z } from '@hono/zod-openapi';
import type { Env, OrgContext } from '#/core/context';
import { AppError } from '#/core/error';
import { lisRoleUri } from '#/lib/lti-vocabulary';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { ltiMembershipsUrl } from '#/modules/lti-platform/helpers/launch-message';
import { ltiRolesIn } from '#/modules/lti-platform/helpers/lti-roles';
import { releasedClaims } from '#/modules/lti-platform/helpers/platform-offer';
import { findLtiMembers } from '#/modules/lti-platform/lti-platform-queries';
import type { listLtiMembersQuerySchema, ltiMembershipContainerSchema, ltiMembershipsParamSchema } from '#/modules/lti-platform/lti-platform-schema';
import { accessFrom } from '#/permissions/access';
import { assertReadsPeople } from '#/permissions/visible-people';

type LtiToolContext = { var: OrgContext['var'] & Pick<Env['Variables'], 'ltiInstallation'> };

type LtiMember = z.infer<typeof ltiMembershipContainerSchema>['members'][number];

/** How many batches of `limit` people one page reads at most, to fill a page a role filter thins. */
const maxBatches = 10;

/**
 * A page of the members of a channel where an installed LTI tool has a tab that is on, as an NRPS membership
 * container, for its own token. That tab binds it to the channel (`ltiToolGuard`); whom it sees there is what that
 * binding reads (`assertReadsPeople`), masked by the token, and of them the people its access reads
 * (`readableMembershipsWhere`). Each member carries the person's id, their LTI context roles from their membership
 * there (`ltiRolesIn`), as a launch decides them, and the personal claims a launch would carry. People come in order
 * of id from after `after`. With `role`, a page holds the members with that role among at most `maxBatches` batches,
 * and may hold fewer than `limit` while more follow.
 * @param search The query the page was read with, which its address in the container keeps.
 * @returns The container, and the address of the next page while the channel lists more.
 * @throws AppError 404 `not_found` with the channel's `entityType` for a channel that is gone; 403 `forbidden`
 *   (`entityType: 'user'`) when the binding or the token's scopes read no people there; 400 `lti_rlid_unsupported` for
 *   `rlid`; 500 on a route without `ltiToolGuard`, which sets no installation.
 */
export async function getLtiMembersOp(
  ctx: LtiToolContext,
  path: z.infer<typeof ltiMembershipsParamSchema>,
  { role, limit, after, rlid }: z.infer<typeof listLtiMembersQuerySchema>,
  search: string,
) {
  const { organizationId, ltiInstallation } = ctx.var;
  const { channelType } = path;
  if (!ltiInstallation) throw new AppError(500, 'server_error', 'error', { meta: { reason: 'lti_installation_missing' } });
  if (rlid) throw new AppError(400, 'lti_rlid_unsupported', 'info');
  const channel = await resolveEntity(ctx, { entityType: channelType, identifier: path.channelId });
  if (!channel) throw new AppError(404, 'not_found', 'warn', { entityType: channelType });
  assertReadsPeople(ctx, channelType, channel);
  const access = accessFrom(ctx);

  const { installation, client } = ltiInstallation;
  const wanted = role && lisRoleUri(role);
  const members: LtiMember[] = [];
  let cursor = after;
  let listed = false;
  for (let batch = 0; batch < maxBatches && !listed && members.length < limit; batch++) {
    const people = await findLtiMembers(ctx, { organizationId, channelType, channelId: channel.id, access, after: cursor, limit: limit + 1 });
    const read = people.slice(0, limit);
    let taken = 0;
    for (const person of read) {
      if (members.length === limit) break;
      taken += 1;
      cursor = person.id;
      const roles = ltiRolesIn(person.id, { channelType, channelId: channel.id, organizationId, role: person.role }, channelType, channel);
      if (wanted && !roles.includes(wanted)) continue;
      members.push({
        user_id: person.id,
        roles,
        status: 'Active',
        ...releasedClaims(installation.releasedFields, client.ltiToolConfig.claims, person),
      });
    }
    listed = people.length <= limit && taken === read.length;
  }

  const address = ltiMembershipsUrl({ tenantId: ctx.var.tenantId, organizationId }, path);
  const next = new URLSearchParams({ limit: String(limit), ...(role && { role }), ...(cursor && { after: cursor }) });
  const container = { id: `${address}${search}`, context: { id: channel.id, label: channel.slug, title: channel.name }, members };
  return { container, nextUrl: listed ? undefined : `${address}?${next}` };
}
