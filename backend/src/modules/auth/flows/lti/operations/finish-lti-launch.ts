import type { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { appConfig, hierarchy } from 'shared';
import { buildNotificationPath } from 'shared/utils/notification-link';
import type { DbContext, Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { lisContextRoles, ltiClaims } from '#/lib/lti-vocabulary';
import type { MembershipEntity } from '#/lib/module';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { setEmbeddedSession } from '#/modules/auth/core/sessions/operations/create-session';
import { decodeLaunchState } from '#/modules/auth/flows/lti/helpers/launch-state';
import { launchPlatformApi } from '#/modules/auth/flows/lti/helpers/platform-api';
import { createLtiContextChannel, type LtiContext, ltiContextChannelType, ltiContextRole } from '#/modules/auth/flows/lti/lti-context-channel';
import type { LtiContextModel } from '#/modules/auth/flows/lti/lti-contexts-db';
import { findLtiContext, upsertLtiContext } from '#/modules/auth/flows/lti/lti-contexts-queries';
import type { ltiFinishFormSchema } from '#/modules/auth/flows/lti/lti-schema';
import { createLtiAccount } from '#/modules/auth/flows/lti/operations/create-lti-account';
import { requestLtiMemberImport } from '#/modules/auth/flows/lti/operations/import-lti-members';
import { findLaunchConnection, type LtiLaunch, validateLtiLaunch } from '#/modules/auth/flows/lti/operations/validate-lti-launch';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { recordFirstLtiDeployment } from '#/modules/connections/connections-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { channelIdColumnsOf } from '#/modules/memberships/helpers/membership-helpers';
import type { MembershipModel } from '#/modules/memberships/memberships-db';
import { findMembershipsByUserIdsAndChannel, updateMembershipRole } from '#/modules/memberships/memberships-queries';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';
import { findIdentityBySubject, lockIdentityKey, updateIdentity } from '#/modules/user/identities-queries';
import { findUserById } from '#/modules/user/user-queries';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

const dbCtx = { var: { db: baseDb } };

/** The LTI roles that may set a course up in the app: Instructor and Administrator of the context. */
const contextSetUpRoles = new Set<string>([lisContextRoles.instructor, lisContextRoles.administrator]);

/** Where a launch's context leads: a channel the app has, or a context whose channel this launch creates. */
type ContextPlan = { channel: MembershipEntity } | { create: LtiContext };

/**
 * The channel an LTI context below the organization maps to: the one its row names. Before it has one, only an
 * Instructor or Administrator of the context may arrive, and the launch creates it.
 * @throws AppError 409 `lti_context_not_set_up` for anyone else.
 */
export const planLtiContextChannel = async (
  ctx: DbContext,
  { connectionId, context, ltiRoles }: { connectionId: string; context: LtiContext; ltiRoles: string[] },
): Promise<ContextPlan> => {
  const row = await findLtiContext(ctx, { connectionId, contextId: context.id });
  const channel = row && (await resolveEntity(ctx, { entityType: row.channelType, identifier: row.channelId }));
  if (channel) return { channel };
  if (ltiRoles.some((role) => contextSetUpRoles.has(role))) return { create: context };
  throw new AppError(409, 'lti_context_not_set_up', 'info', { meta: { connectionId, contextId: context.id } });
};

/**
 * The account a launch acts for, found by its `lti` identity (the platform's issuer and `sub`) under the lock a member
 * import of the person takes, or made for a first arrival (`createLtiAccount`). The identity records the sign-in.
 */
const launchingPersonId = async (ctx: DbContext, { connection, launch }: { connection: LtiConnection; launch: LtiLaunch }) => {
  const { sub, name, given_name: givenName, family_name: familyName, email } = launch;
  const signedInAt = getIsoDate();
  const key = { kind: 'lti', provider: connection.issuer, subject: sub } as const;
  await lockIdentityKey(ctx, key);
  const identity = await findIdentityBySubject(ctx, key);
  if (!identity) return createLtiAccount(ctx, { connection, person: { sub, name, givenName, familyName, email }, signedInAt });
  await updateIdentity(ctx, { id: identity.id, values: { lastSignInAt: signedInAt, connectionId: connection.id, email: email ?? null } });
  return identity.userId;
};

interface ApplyLtiRoleOpts {
  userId: string;
  channel: MembershipEntity;
  role: MembershipModel['role'];
}

/**
 * Gives the person the role a launch maps to in the channel: a new membership as the SSO path writes one, or the
 * existing one's role changed. A role in a channel below the organization follows the launch up and down; an
 * organization role only goes up.
 */
const applyLtiRole = async (ctx: DbContext, { userId, channel, role }: ApplyLtiRoleOpts) => {
  const [membership] = await findMembershipsByUserIdsAndChannel(ctx, { userIds: [userId], channelId: channel.id });
  if (!membership) {
    await insertMemberships(ctx, { items: [{ userId, role, entity: channel, createdBy: userId }] });
    return;
  }
  const follows = channel.entityType === 'organization' ? hierarchy.outranks('organization', role, membership.role) : role !== membership.role;
  if (follows) await updateMembershipRole(ctx, { id: membership.id, role, by: userId });
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
 * creates the person, applies the mapped role and records the context with the platform's API addresses it trusts,
 * and the LTI deployment of a connection that held none, all in one transaction. Then it starts the embedded session:
 * no MFA challenge, the launch is the proof. A launch by the context's Instructor or Administrator asks for a member
 * import (`requestLtiMemberImport`) without waiting for it.
 * @returns The embedded page of the channel to redirect to.
 * @throws AppError 403 `lti_launch_cross_site` for a request the browser does not mark same-origin, 403
 *   `lti_deployment_unknown` when another first launch recorded a different deployment, 409 `lti_context_not_set_up`,
 *   409 `write_conflict` when another launch created the context's channel at once, and what `findLaunchConnection`
 *   and `validateLtiLaunch` throw.
 */
export async function finishLtiLaunchOp(ctx: Context<Env>, form: z.infer<typeof ltiFinishFormSchema>): Promise<string> {
  if (ctx.req.header('Sec-Fetch-Site') !== 'same-origin') throw new AppError(403, 'lti_launch_cross_site', 'warn');
  const state = decodeLaunchState(form.state);
  const { id_token: token, storage_value: storageValue } = form;
  if (!state || !token || !storageValue) throw new AppError(401, 'lti_launch_invalid', 'warn', { meta: { rule: 'form' } });

  const { connection, header, claims } = await findLaunchConnection(token);
  const launch = await validateLtiLaunch({ token, header, claims, connection, state, storageValue });

  const organization = await findOrganizationByTenant(dbCtx, { tenantId: connection.tenantId });
  if (!organization) throw new AppError(404, 'not_found', 'warn', { entityType: 'organization' });

  const ltiRoles = launch[ltiClaims.roles];
  const contextClaim = launch[ltiClaims.context];
  const context = contextClaim && { id: contextClaim.id, label: contextClaim.label, title: contextClaim.title, types: contextClaim.type ?? [] };
  // Decided before any account exists: whoever arrives at a course nobody set up yet leaves nothing behind.
  const plan: ContextPlan =
    context && ltiContextChannelType !== 'organization'
      ? await planLtiContextChannel(dbCtx, { connectionId: connection.id, context, ltiRoles })
      : { channel: organization };
  const deploymentId = launch[ltiClaims.deploymentId];
  const platformApi = launchPlatformApi(connection, claims);

  const { userId, channel, contextRow } = await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const userId = await launchingPersonId(txCtx, { connection, launch });
    const channel =
      'channel' in plan ? plan.channel : await createLtiContextChannel(txCtx, { organization, context: plan.create, createdBy: userId });

    let contextRow: LtiContextModel | undefined;
    if (context) {
      const { id: contextId, label, title, types } = context;
      contextRow = await upsertLtiContext(txCtx, {
        values: {
          ...channelIdColumnsOf(channel),
          tenantId: connection.tenantId,
          connectionId: connection.id,
          contextId,
          label,
          title,
          types,
          channelType: channel.entityType,
          channelId: channel.id,
          ...platformApi,
        },
        by: userId,
      });
      // Another launch of the same course created its channel at the same moment: this one rolls back.
      if (contextRow.channelId !== channel.id && 'create' in plan)
        throw new AppError(409, 'write_conflict', 'warn', { meta: { contextId: context.id } });
    }

    await applyLtiRole(txCtx, { userId, channel, role: ltiContextRole({ ltiRoles, connection }) });
    // Validation let any deployment through to a connection that held none: another first launch may have recorded one since.
    if (!connection.config.deploymentIds.length && !(await recordFirstLtiDeployment(txCtx, { id: connection.id, deploymentId, by: userId }))) {
      throw new AppError(403, 'lti_deployment_unknown', 'warn', { meta: { rule: 'deployment_id', connectionId: connection.id } });
    }
    return { userId, channel, contextRow };
  });
  invalidateCache.user(userId);
  if (contextRow && ltiRoles.some((role) => contextSetUpRoles.has(role))) void requestLtiMemberImport(contextRow);

  const user = await findUserById(dbCtx, { id: userId });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });
  await setEmbeddedSession(ctx, user, { connectionId: connection.id });

  log.info('LTI launch', { connectionId: connection.id, channelType: channel.entityType, channelId: channel.id });
  return embeddedPageUrl(channel);
}
