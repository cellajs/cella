import type { Context } from 'hono';
import { appConfig, hierarchy } from 'shared';
import { isUuid } from 'shared/utils/entity-id';
import type { Env } from '#/core/context';
import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { routeTarget } from '#/middlewares/guard/route-target';
import { challengeRefusal, setServiceActor, unauthorized } from '#/middlewares/guard/service-guard';
import { serviceBurstLimiter } from '#/middlewares/rate-limiter/limiters';
import { updateLastSeenAt } from '#/middlewares/update-last-seen';
import { placementContext } from '#/modules/lti-platform/helpers/context-channel';
import { findLtiInstallation, findLtiPlacements } from '#/modules/lti-platform/lti-platform-queries';
import { bearerChallenge, type ResourceRef } from '#/modules/oauth-server/resources';
import { bearerJwtFrom, type VerifiedAccessToken, verifyAccessToken } from '#/modules/oauth-server/verify-access-token';
import type { RoleBinding } from '#/modules/service-accounts/service-accounts-schema';

const dbCtx = { var: { db: baseDb } };

/**
 * An installed LTI tool's token: its installation, read at every use, must still be the approved, active one of the
 * registration the token was issued to, and still hold every scope the token carries. A disable, or a scope an admin
 * takes away, stops the token at its next request in every process.
 */
const resolveInstallationToken = async (token: VerifiedAccessToken) => {
  if (token.kind !== 'installation') throw unauthorized('lti_installation_token_required');
  const found = await findLtiInstallation(dbCtx, { id: token.actorId, tenantId: token.tenantId });
  if (!found || found.client.id !== token.clientId || !found.installation.approvedAt) throw unauthorized('lti_installation_unknown');
  if (found.account.status !== 'active') throw unauthorized('service_account_disabled');
  if (!token.scopes.every((scope) => found.installation.grantedScopes.includes(scope))) throw unauthorized('lti_scope_withdrawn');
  updateLastSeenAt(found.account.id);
  return found;
};

/**
 * The access the installation's placements in or below the course in the route's path imply, read at every request:
 * the least privileged role of the course's type, when one of them in the route's organization launches as that course
 * (`placementContext`). Nothing is stored: a removed tab or a deleted channel takes it away at once. A path that names
 * no channel by its type and id binds nothing, and the route's validation refuses it.
 */
const courseBindings = async (installationId: string, ctx: Context<Env>): Promise<RoleBinding[]> => {
  const channelType = appConfig.channelEntityTypes.find((type) => type === ctx.req.param('channelType'));
  const [channelId, organizationId] = [ctx.req.param('channelId'), ctx.req.param('organizationId')?.toLowerCase()];
  if (!channelType || !channelId || !organizationId || !isUuid(channelId) || !isUuid(organizationId)) return [];
  const placements = await findLtiPlacements(dbCtx, { installationId, organizationId, course: { channelType, channelId } });
  const placed = placements.some((placement) => {
    const context = placementContext(placement);
    return context?.channelType === channelType && context.channelId === channelId;
  });
  return placed ? [{ channelType, channelId, organizationId, role: hierarchy.getLeastPrivilegedRole(channelType) }] : [];
};

/**
 * The guard of the routes an installed LTI tool calls as itself (`ltiMemberRoutes`), each for the course in its path:
 * only a token of an LTI installation, verified locally and bound to this route's tenant. The request acts as the
 * installation's service account with the binding its placements imply on that course (`courseBindings`), masked by
 * the token's scopes, and carries the installation. Every other proof is refused, a person's token and an API key
 * included.
 */
export const ltiToolGuard = xMiddleware(
  {
    functionName: 'ltiToolGuard',
    type: 'x-guard',
    errors: [401],
    security: [{ oauth2: [] }],
    provides: ['actor'],
    limiters: [serviceBurstLimiter],
    name: 'LTI tool',
    description:
      'Works only with an access token of an installed LTI tool. The request acts as its installation in the courses it is placed in or below, within the scopes an admin granted.',
  },
  async (ctx, next) => {
    const target = routeTarget(ctx);
    const ref: ResourceRef = { face: 'api', tenantId: target.tenantId };
    const jwt = bearerJwtFrom(ctx);
    if (!jwt) {
      ctx.header('WWW-Authenticate', bearerChallenge(ref));
      throw unauthorized('access_token_required');
    }
    await challengeRefusal(ctx, ref, async () => {
      const token = await verifyAccessToken(jwt, { tenantId: target.tenantId });
      const found = await resolveInstallationToken(token);
      const bindings = await courseBindings(found.account.id, ctx);
      setServiceActor(ctx, { ...found.account, bindings }, token.scopes);
      ctx.set('ltiInstallation', found);
    });
    return serviceBurstLimiter(ctx, next);
  },
);
