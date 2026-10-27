import type { ActorContext } from '#/core/context';
import { toOrganizationResponse } from '#/modules/organization/operations/to-organization-response';
import { getValidChannel } from '#/permissions';

/**
 * An organization by id, or by slug with `bySlug`, with the counts and the caller's membership `include` asks for.
 * @throws The refusals of `getValidChannel` for `read`: an organization of another tenant reads as missing.
 */
export async function getOrganizationOp(ctx: ActorContext, id: string, opts: { bySlug?: boolean; include: string[] }) {
  const { bySlug, include } = opts;

  const { entity, membership } = await getValidChannel(ctx, id, 'organization', 'read', bySlug);

  return toOrganizationResponse(ctx, entity, membership, { counts: include.includes('counts'), membership: include.includes('membership') });
}
