import { xMiddleware } from '#/core/x-middleware';
import { baseDb } from '#/db/db';
import { routeTarget } from '#/middlewares/guard/route-target';
import { challengeRefusal, setServiceActor, unauthorized } from '#/middlewares/guard/service-guard';
import { serviceBurstLimiter } from '#/middlewares/rate-limiter/limiters';
import { updateLastSeenAt } from '#/middlewares/update-last-seen';
import { findLtiInstallation } from '#/modules/lti-platform/lti-platform-queries';
import { bearerChallenge, type ResourceRef } from '#/modules/oauth-server/resources';
import { bearerJwtFrom, type VerifiedAccessToken, verifyAccessToken } from '#/modules/oauth-server/verify-access-token';

/**
 * An installed LTI tool's token: its installation, read at every use, must still be the approved, active one of the
 * registration the token was issued to, and still hold every scope the token carries. A disable, or a scope an admin
 * takes away, stops the token at its next request in every process.
 */
const resolveInstallationToken = async (token: VerifiedAccessToken) => {
  if (token.kind !== 'installation') throw unauthorized('lti_installation_token_required');
  const found = await findLtiInstallation({ var: { db: baseDb } }, { id: token.actorId, tenantId: token.tenantId });
  if (!found || found.client.id !== token.clientId || !found.installation.approvedAt) throw unauthorized('lti_installation_unknown');
  if (found.account.status !== 'active') throw unauthorized('service_account_disabled');
  if (!token.scopes.every((scope) => found.installation.grantedScopes.includes(scope))) throw unauthorized('lti_scope_withdrawn');
  updateLastSeenAt(found.account.id);
  return found.account;
};

/**
 * The guard of the routes an installed LTI tool calls as itself: only a token of an LTI installation, verified locally
 * and bound to this route's tenant. The request acts as the installation's service account, with its bindings, masked
 * by the token's scopes. Every other proof is refused, a person's token and an API key included.
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
      'Works only with an access token of an installed LTI tool. The request acts as its installation, within the scopes an admin granted.',
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
      setServiceActor(ctx, await resolveInstallationToken(token), token.scopes);
    });
    return serviceBurstLimiter(ctx, next);
  },
);
