import { appConfig } from 'shared';
import type { UserContext } from '#/core/context';
import { issueHandoffToken } from '#/modules/auth/core/tokens/token-lifecycle';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';

/**
 * Creates a one-use registration link for the organization's tenant, for a caller who may update the organization.
 * It is answered once and stored only as a hash: whoever opens it registers a platform's connection for the tenant.
 */
export async function createLtiRegistrationLinkOp(ctx: UserContext) {
  const { tenantId, organizationId } = ctx.var;
  await getValidChannel(ctx, organizationId, 'organization', 'update');

  const { rawToken, expiresAt } = await issueHandoffToken(ctx, { kind: 'lti-registration', tenantId, createdBy: ctx.var.user.id });

  log.info('LTI registration link created', { tenantId, organizationId });
  return { url: `${appConfig.backendAuthUrl}/lti/register?link=${rawToken}`, expiresAt };
}
