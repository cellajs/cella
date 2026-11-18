import type { UserContext } from '#/core/context';
import { issueHandoffToken } from '#/modules/auth/core';
import { ltiIssuerUrl } from '#/modules/lti-platform/helpers/platform-offer';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';

/**
 * Starts an LTI tool's Dynamic Registration for the organization's tenant, for a caller who may update the
 * organization. The answer is the LTI tool's registration address with the platform's configuration address and a
 * one-use registration token added, its own query kept. The token is answered once and stored only as a hash: the
 * registration it admits is private to the tenant and waits for an admin's approval.
 */
export async function startLtiToolRegistrationOp(ctx: UserContext, { registrationUrl }: { registrationUrl: string }) {
  const { tenantId, organizationId } = ctx.var;
  await getValidChannel(ctx, organizationId, 'organization', 'update');

  const { rawToken, expiresAt } = await issueHandoffToken(ctx, { kind: 'lti-tool-registration', tenantId, createdBy: ctx.var.user.id });

  const url = new URL(registrationUrl);
  url.searchParams.set('openid_configuration', ltiIssuerUrl('configuration'));
  url.searchParams.set('registration_token', rawToken);

  log.info('LTI tool registration started', { tenantId, organizationId });
  return { url: url.href, expiresAt };
}
