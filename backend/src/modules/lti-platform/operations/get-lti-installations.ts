import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { requestedFields } from '#/modules/lti-platform/helpers/platform-offer';
import { findLtiInstallations, type LtiInstallationRecord } from '#/modules/lti-platform/lti-platform-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';

/** An installation as the routes answer it, its writers still ids: the side row's stamps, the registration's terms. */
export const toLtiInstallation = ({ account, installation, client }: LtiInstallationRecord) => ({
  id: account.id,
  clientId: client.id,
  name: client.name,
  logoUri: client.logoUri,
  domain: client.ltiToolConfig.domain,
  description: client.ltiToolConfig.description ?? null,
  claims: client.ltiToolConfig.claims,
  requestedFields: requestedFields(client.ltiToolConfig.claims),
  releasedFields: installation.releasedFields,
  status: account.status,
  approvedAt: installation.approvedAt,
  createdAt: installation.createdAt,
  updatedAt: installation.updatedAt,
  createdBy: installation.createdBy,
  updatedBy: installation.updatedBy,
});

/** The LTI installations of the organization's tenant with their registrations, for a caller who may update the organization. */
export async function getLtiInstallationsOp(ctx: UserContext) {
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const records = await findLtiInstallations(ctx, { tenantId: ctx.var.tenantId });
  return withActorRefs(ctx, records.map(toLtiInstallation));
}
