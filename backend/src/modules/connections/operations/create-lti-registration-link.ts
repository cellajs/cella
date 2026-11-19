import { appConfig } from 'shared';
import type { UserContext } from '#/core/context';
import { issueHandoffToken } from '#/modules/auth/core';
import { assertLtiConnectionRoom } from '#/modules/connections/operations/assert-lti-connection-room';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';

/**
 * Creates a one-use registration link for the organization's tenant, for a caller who may update the organization.
 * It is answered once and stored only as a hash: whoever opens it registers a platform's connection for the tenant.
 * @throws AppError 403 `lti_connection_limit` while the tenant holds its quota of LTI connections.
 */
export async function createLtiRegistrationLinkOp(ctx: UserContext) {
  const { tenantId, organizationId } = ctx.var;
  await getValidChannel(ctx, organizationId, 'organization', 'update');
  await assertLtiConnectionRoom(ctx, ctx.var.tenant);

  const { rawToken, expiresAt } = await issueHandoffToken(ctx, { kind: 'lti-registration', tenantId, createdBy: ctx.var.user.id });

  log.info('LTI registration link created', { tenantId, organizationId });
  return { url: `${appConfig.backendAuthUrl}/lti/register?link=${rawToken}`, expiresAt };
}
