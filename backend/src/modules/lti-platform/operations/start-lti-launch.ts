import { appConfig } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { issueHandoffToken, readHandoffToken } from '#/modules/auth/core/tokens/token-lifecycle';
import { launchTargetLinkUri, loginInitiationUrl, ltiToolOrigins } from '#/modules/lti-platform/helpers/launch-message';
import { findLtiLaunchTarget } from '#/modules/lti-platform/lti-platform-queries';
import { getValidLtiResourceLink } from '#/modules/lti-platform/operations/manage-lti-resource-links';
import { log } from '#/utils/logger';

/**
 * Starts a launch of a resource link, for a caller who may read its channel now: a one-use launch record names the
 * person, the tenant and the resource link. The answer is the login initiation page that hands the record to the LTI
 * tool, and the origins whose platform storage messages the frame host answers.
 * @throws AppError 409 `lti_installation_not_active` while the installation waits for an approval or is disabled, and
 *   what `getValidLtiResourceLink` throws.
 */
export async function startLtiLaunchOp(ctx: UserContext, id: string) {
  const { tenantId } = ctx.var;
  const { link } = await getValidLtiResourceLink(ctx, id, 'read');
  const target = await findLtiLaunchTarget(ctx, { resourceLinkId: link.id });
  if (!target?.installation.approvedAt || target.account.status !== 'active') {
    throw new AppError(409, 'lti_installation_not_active', 'warn', { meta: { installationId: link.installationId } });
  }

  const { rawToken, expiresAt } = await issueHandoffToken(ctx, {
    kind: 'lti-launch',
    tenantId,
    createdBy: ctx.var.user.id,
    ltiResourceLinkId: link.id,
  });
  const url = new URL(loginInitiationUrl);
  url.searchParams.set('token', rawToken);

  log.info('LTI launch started', { resourceLinkId: link.id, installationId: link.installationId, tenantId });
  return { url: url.href, ltiToolOrigins: ltiToolOrigins(target.client), expiresAt };
}

/**
 * The login initiation a launch record names (1EdTech Security Framework 1.0, section 5.1.1.1), for the page that posts
 * it to the LTI tool. The record stays: the launch endpoint spends it. The hints refer to it, opaque to the LTI tool:
 * `login_hint` is its id and `lti_message_hint` its raw value. `lti_storage_target` names the frame host, the frame's
 * direct parent, which shares the issuer's origin.
 * @throws AppError 401 `lti-launch_not_found` for a record spent, never issued or whose resource link is gone, 401
 *   `lti-launch_expired`.
 */
export async function initiateLtiLoginOp(rawToken: string) {
  const record = await readHandoffToken({ kind: 'lti-launch', rawToken });
  const target = record.ltiResourceLinkId
    ? await findLtiLaunchTarget({ var: { db: baseDb } }, { resourceLinkId: record.ltiResourceLinkId })
    : undefined;
  if (!target || target.resourceLink.tenantId !== record.tenantId)
    throw new AppError(401, 'lti-launch_not_found', 'warn', { meta: { tokenId: record.id } });

  const { client } = target;
  return {
    action: client.initiateLoginUri,
    fields: {
      iss: appConfig.oauthUrl,
      login_hint: record.id,
      lti_message_hint: rawToken,
      target_link_uri: launchTargetLinkUri(client),
      client_id: client.id,
      lti_deployment_id: target.account.id,
      lti_storage_target: '_parent',
    },
  };
}
