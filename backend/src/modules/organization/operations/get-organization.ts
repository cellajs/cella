import type { ActorContext } from '#/core/context';
import { toOrganizationResponse } from '#/modules/organization/operations/to-organization-response';
import { getValidChannel } from '#/permissions';

export async function getOrganizationOp(ctx: ActorContext, id: string, opts: { bySlug?: boolean; include: string[] }) {
  const { bySlug, include } = opts;

  // The tenant comparison is getValidChannel's: an organization of another tenant reads as missing.
  const { entity, membership } = await getValidChannel(ctx, id, 'organization', 'read', bySlug);

  return toOrganizationResponse(ctx, entity, membership, { counts: include.includes('counts'), membership: include.includes('membership') });
}
