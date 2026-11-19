import { appConfig } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { readMemberships } from '#/middlewares/guard/membership-cache';
import { issueHandoffToken, readHandoffToken } from '#/modules/auth/core';
import { holdsLtiTabs } from '#/modules/lti-platform/helpers/context-channel';
import { launchOrigins, launchTargetLinkUri, loginInitiationUrl } from '#/modules/lti-platform/helpers/launch-message';
import { findLtiLaunchTarget, findLtiResourceLink } from '#/modules/lti-platform/lti-platform-queries';
import type { LtiResourceLinkModel } from '#/modules/lti-platform/lti-resource-links-db';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { log } from '#/utils/logger';

type LaunchedLink = Pick<LtiResourceLinkModel, 'tenantId' | 'organizationId' | 'channelType' | 'channelId'>;

/**
 * Who may launch a resource link: a person who may read its channel through their own memberships, read now. A system
 * admin is nobody special here: the ID token carries the person's own access, as a token does. Starting a launch and
 * the launch endpoint decide alike.
 * @returns The channel, and the person's memberships, which the launch's roles are decided with.
 * @throws AppError 404 when the person may not read the channel.
 */
export const readAsLauncher = async (personId: string, link: LaunchedLink) => {
  const { memberships } = await readMemberships(personId);
  const launcherCtx = {
    var: {
      db: baseDb,
      tenantId: link.tenantId,
      organizationId: link.organizationId,
      actor: { id: personId, bindings: memberships, scopes: null },
      isSystemAdmin: false,
    },
  };
  const { entity } = await getValidChannel(launcherCtx, link.channelId, link.channelType, 'read');
  return { channel: entity, memberships };
};

/**
 * Starts a launch of a resource link, for a caller who may launch it (`readAsLauncher`): a one-use launch record names
 * the person, the tenant and the resource link. The answer is the login initiation page that hands the record to the
 * LTI tool.
 * @throws AppError 404 `not_found` for no such link or a caller who may not launch it, 409 `lti_tab_switched_off` for a
 *   tab switched off, 409 `lti_channel_type_not_allowed` for a tab in a channel type that holds none, 409
 *   `lti_installation_not_active` while the installation waits for an approval or is disabled.
 */
export async function startLtiLaunchOp(ctx: UserContext, id: string) {
  const { tenantId, organizationId } = ctx.var;
  const link = await findLtiResourceLink(ctx, { id, organizationId });
  if (!link) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'ltiResourceLink' } });
  await readAsLauncher(ctx.var.user.id, link);
  if (!link.enabled) throw new AppError(409, 'lti_tab_switched_off', 'warn', { meta: { resourceLinkId: link.id } });
  if (!holdsLtiTabs(link.channelType)) throw new AppError(409, 'lti_channel_type_not_allowed', 'warn', { entityType: link.channelType });
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
  return { url: url.href, expiresAt };
}

/** The frame that answers platform storage messages: the frame host. */
const storageTarget = '_parent';

/**
 * The login initiation a launch record names (1EdTech Security Framework 1.0, section 5.1.1.1), for the page that posts
 * it to the LTI tool. The record stays: the launch endpoint spends it. The hints refer to it, opaque to the LTI tool:
 * `login_hint` is its id and `lti_message_hint` its raw value. `lti_storage_target` names the frame host, the frame's
 * direct parent, which shares the issuer's origin; it also goes in the address's query, where the LTI Client Side
 * postMessages draft looks for it.
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
  const action = new URL(client.initiateLoginUri);
  action.searchParams.set('lti_storage_target', storageTarget);
  return {
    action: action.href,
    // The LTI tool's login sends the browser on to the issuer, on the app's origin, through any of its own.
    formOrigins: ["'self'", ...launchOrigins(client)],
    fields: {
      iss: appConfig.oauthUrl,
      login_hint: record.id,
      lti_message_hint: rawToken,
      target_link_uri: launchTargetLinkUri(client),
      client_id: client.id,
      lti_deployment_id: target.account.id,
      lti_storage_target: storageTarget,
    },
  };
}
