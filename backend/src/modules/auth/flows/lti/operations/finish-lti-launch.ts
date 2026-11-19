import type { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig } from 'shared';
import { buildNotificationPath } from 'shared/utils/notification-link';
import type { DbContext, Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { lisContextRoles, ltiClaims } from '#/lib/lti-vocabulary';
import type { MembershipEntity } from '#/lib/module';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { setEmbeddedSession } from '#/modules/auth/core/sessions/operations/create-session';
import { decodeLaunchState } from '#/modules/auth/flows/lti/helpers/launch-state';
import { launchMembershipsUrl } from '#/modules/auth/flows/lti/helpers/platform-memberships';
import { createLtiContextChannel, type LtiContext, ltiContextChannelType } from '#/modules/auth/flows/lti/lti-context-channel';
import type { LtiContextModel } from '#/modules/auth/flows/lti/lti-contexts-db';
import { findLtiContext, upsertLtiContext } from '#/modules/auth/flows/lti/lti-contexts-queries';
import type { ltiFinishFormSchema } from '#/modules/auth/flows/lti/lti-schema';
import { admitLtiPerson, applyLtiRole, ltiRoleIn } from '#/modules/auth/flows/lti/operations/admit-lti-person';
import { requestLtiMemberImport } from '#/modules/auth/flows/lti/operations/import-lti-members';
import { findLaunchConnection, validateLtiLaunch } from '#/modules/auth/flows/lti/operations/validate-lti-launch';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { recordFirstLtiDeployment } from '#/modules/connections/connections-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { channelIdColumnsOf } from '#/modules/memberships/helpers/membership-helpers';
import { findMembershipsByUserIdsAndChannel } from '#/modules/memberships/memberships-queries';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findTenant } from '#/modules/tenants/tenants-queries';
import { findUserById } from '#/modules/user/user-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

const dbCtx = { var: { db: baseDb } };

/** The LTI roles that may set a course up in the app: Instructor and Administrator of the context. */
const contextSetUpRoles = new Set<string>([lisContextRoles.instructor, lisContextRoles.administrator]);

/** Where a launch's context leads: a channel the app has, or a context whose channel this launch creates. */
type ContextPlan = { channel: MembershipEntity } | { create: LtiContext };

/**
 * The channel an LTI context below the organization maps to: the one its row in the connection's tenant names, also
 * when another registration of the platform launched it before. Before it has one, only an Instructor or Administrator
 * of the context may arrive, and the launch creates it.
 * @throws AppError 409 `lti_context_not_set_up` for anyone else.
 */
export const planLtiContextChannel = async (
  ctx: DbContext,
  { connection, context, ltiRoles }: { connection: Pick<LtiConnection, 'id' | 'tenantId' | 'issuer'>; context: LtiContext; ltiRoles: string[] },
): Promise<ContextPlan> => {
  const row = await findLtiContext(ctx, { tenantId: connection.tenantId, issuer: connection.issuer, contextId: context.id });
  const channel = row && (await resolveEntity(ctx, { entityType: row.channelType, identifier: row.channelId }));
  if (channel) return { channel };
  if (ltiRoles.some((role) => contextSetUpRoles.has(role))) return { create: context };
  throw new AppError(409, 'lti_context_not_set_up', 'info', { meta: { connectionId: connection.id, contextId: context.id } });
};

/**
 * The embedded page of a channel: `/embed` in front of the path the app's own links to a channel take
 * (`buildNotificationPath`), which the frontend resolves to the channel's page.
 */
const embeddedPageUrl = (channel: MembershipEntity) =>
  `${appConfig.frontendUrl}/embed${buildNotificationPath({
    tenantId: channel.tenantId,
    organizationId: channelIdColumnsOf(channel).organizationId,
    channelId: channel.id,
    channelType: channel.entityType,
  })}`;

/**
 * Finishes a launch at the app as an LTI tool, posted same-origin by the launch page with the value platform storage
 * held. Checks the launch (`validateLtiLaunch`), maps its context to a channel (`ltiContextChannelType`), finds or
 * creates the person (`admitLtiPerson`), applies the mapped role (`applyLtiRole`) and records the context with the
 * membership address it trusts, and the LTI deployment of a connection that held none, all in one transaction. A
 * context another live connection holds is only read for its channel (`upsertLtiContext`). In an archived channel a
 * member keeps their role. Then it starts the embedded session: no MFA challenge, the launch is the proof. A launch by
 * the context's Instructor or Administrator, through the connection that holds it, asks for a member import
 * (`requestLtiMemberImport`) without waiting for it.
 * @returns The embedded page of the channel to redirect to.
 * @throws AppError 403 `lti_launch_cross_site` for a request the browser does not mark same-origin, 403
 *   `channel_archived` for a person the launch would add to an archived channel, 403 `lti_member_limit` for a person
 *   who needs a seat while none is left, 403 `lti_deployment_unknown` when another first launch recorded a different
 *   deployment, 409 `lti_context_not_set_up`, 409 `write_conflict` when another launch created the context's channel
 *   at once, and what `findLaunchConnection` and `validateLtiLaunch` throw.
 */
export async function finishLtiLaunchOp(ctx: Context<Env>, form: z.infer<typeof ltiFinishFormSchema>): Promise<string> {
  if (ctx.req.header('Sec-Fetch-Site') !== 'same-origin') throw new AppError(403, 'lti_launch_cross_site', 'warn');
  const state = decodeLaunchState(form.state);
  const { id_token: token, storage_value: storageValue } = form;
  if (!state || !token || !storageValue) throw new AppError(401, 'lti_launch_invalid', 'warn', { meta: { rule: 'form' } });

  const { connection, header, claims } = await findLaunchConnection(token);
  const launch = await validateLtiLaunch({ token, header, claims, connection, state, storageValue });

  const [organization, tenant] = await Promise.all([
    findOrganizationByTenant(dbCtx, { tenantId: connection.tenantId }),
    findTenant(dbCtx, { where: eq(tenantsTable.id, connection.tenantId) }),
  ]);
  if (!organization || !tenant) throw new AppError(404, 'not_found', 'warn', { entityType: 'organization' });

  const ltiRoles = launch[ltiClaims.roles];
  const contextClaim = launch[ltiClaims.context];
  const context = contextClaim && { id: contextClaim.id, label: contextClaim.label, title: contextClaim.title, types: contextClaim.type ?? [] };
  // Decided before any account exists: whoever arrives at a course nobody set up yet leaves nothing behind.
  const plan: ContextPlan =
    context && ltiContextChannelType !== 'organization'
      ? await planLtiContextChannel(dbCtx, { connection, context, ltiRoles })
      : { channel: organization };
  const deploymentId = launch[ltiClaims.deploymentId];
  const teaches = ltiRoles.some((role) => contextSetUpRoles.has(role));
  const membershipsUrl = launchMembershipsUrl(claims);
  const { sub, name, given_name: givenName, family_name: familyName, email } = launch;

  const { userId, channel, contextRow } = await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const admitted = await admitLtiPerson(txCtx, {
      connection,
      organization,
      memberQuota: tenant.restrictions.quotas.user,
      person: { sub, name, givenName, familyName, email },
      signedInAt: getIsoDate(),
    });
    if (!admitted) throw new AppError(403, 'lti_member_limit', 'warn', { meta: { connectionId: connection.id } });
    const { userId, seat } = admitted;
    const channel =
      'channel' in plan ? plan.channel : await createLtiContextChannel(txCtx, { organization, context: plan.create, createdBy: userId });

    let contextRow: LtiContextModel | undefined;
    if (context) {
      const { id: contextId, label, title, types } = context;
      contextRow = await upsertLtiContext(txCtx, {
        values: {
          ...channelIdColumnsOf(channel),
          tenantId: connection.tenantId,
          issuer: connection.issuer,
          connectionId: connection.id,
          contextId,
          label,
          title,
          types,
          channelType: channel.entityType,
          channelId: channel.id,
          membershipsUrl,
        },
        by: userId,
      });
      // Another launch of the same course created its channel at the same moment: this one rolls back.
      if ('create' in plan && contextRow?.channelId !== channel.id)
        throw new AppError(409, 'write_conflict', 'warn', { meta: { contextId: context.id } });
    }

    // Joining an archived channel is a create inside it, which an archive refuses; a member keeps the role they hold.
    if (channel.archived) {
      const [membership] = await findMembershipsByUserIdsAndChannel(txCtx, { userIds: [userId], channelId: channel.id });
      if (!membership) throw new AppError(403, 'channel_archived', 'warn', { entityType: channel.entityType });
    } else
      await applyLtiRole(txCtx, { organization, channel, userId, seat, role: ltiRoleIn(channel.entityType, { ltiRoles, connection }), by: userId });
    // Validation let any deployment through to a connection that held none: another first launch may have recorded one since.
    if (!connection.config.deploymentIds.length && !(await recordFirstLtiDeployment(txCtx, { id: connection.id, deploymentId, by: userId }))) {
      throw new AppError(403, 'lti_deployment_unknown', 'warn', { meta: { rule: 'deployment_id', connectionId: connection.id } });
    }
    return { userId, channel, contextRow };
  });
  invalidateCache.user(userId);
  if (contextRow && teaches) void requestLtiMemberImport(contextRow, userId);

  const user = await findUserById(dbCtx, { id: userId });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });
  await setEmbeddedSession(ctx, user, { connectionId: connection.id });

  log.info('LTI launch', { connectionId: connection.id, channelType: channel.entityType, channelId: channel.id });
  return embeddedPageUrl(channel);
}
