import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { ltiTabChannelTypes, ltiTabTypeRefusal } from '#/modules/lti-platform/helpers/context-channel';
import { launchOrigins } from '#/modules/lti-platform/helpers/launch-message';
import { requestedFields } from '#/modules/lti-platform/helpers/platform-offer';
import { findLtiInstallations, type LtiInstallationRecord } from '#/modules/lti-platform/lti-platform-queries';
import type { listLtiInstallationsQuerySchema } from '#/modules/lti-platform/lti-platform-schema';
import { getValidChannel } from '#/permissions/get-valid-channel';

/** An installation as the routes answer it, its writers still ids: the side row's stamps, the registration's terms. */
export const toLtiInstallation = ({ account, installation, client }: LtiInstallationRecord) => ({
  id: account.id,
  clientId: client.id,
  name: client.name,
  logoUri: client.logoUri,
  domain: client.ltiToolConfig.domain,
  launchOrigins: launchOrigins(client),
  keySetOrigin: new URL(client.jwksUri).origin,
  description: client.ltiToolConfig.description ?? null,
  clientUri: client.clientUri,
  tosUri: client.tosUri,
  policyUri: client.policyUri,
  claims: client.ltiToolConfig.claims,
  requestedFields: requestedFields(client.ltiToolConfig.claims),
  releasedFields: installation.releasedFields,
  requestedScopes: client.requestedScopes ?? [],
  grantedScopes: installation.grantedScopes,
  channelTypes: ltiTabChannelTypes.filter((channelType) => !ltiTabTypeRefusal(installation, channelType)),
  status: account.status,
  approvedAt: installation.approvedAt,
  createdAt: installation.createdAt,
  updatedAt: installation.updatedAt,
  createdBy: installation.createdBy,
  updatedBy: installation.updatedBy,
});

/** The LTI installations of the organization's tenant with their registrations, for a caller who may update the organization. */
export async function getLtiInstallationsOp(ctx: UserContext, { orderBy }: z.infer<typeof listLtiInstallationsQuerySchema>) {
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const records = await findLtiInstallations(ctx, { tenantId: ctx.var.tenantId, order: orderBy.order });
  return withActorRefs(ctx, records.map(toLtiInstallation));
}
