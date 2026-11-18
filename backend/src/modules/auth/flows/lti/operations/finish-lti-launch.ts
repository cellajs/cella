import type { z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { appConfig, hierarchy } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { buildNotificationPath } from 'shared/utils/notification-link';
import type { DbContext, Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { i18n } from '#/lib/i18n';
import { lisContextRoles, ltiClaims } from '#/lib/lti-vocabulary';
import type { MembershipEntity } from '#/lib/module';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { insertAnonymousUser } from '#/modules/auth/core/anonymous/anonymous-account';
import { setEmbeddedSession } from '#/modules/auth/core/sessions/operations/create-session';
import { decodeLaunchState } from '#/modules/auth/flows/lti/helpers/launch-state';
import type { PageFrame } from '#/modules/auth/flows/lti/helpers/platform-storage-pages';
import { createLtiContextChannel, type LtiContext, ltiContextChannelType, ltiContextRole } from '#/modules/auth/flows/lti/lti-context-channel';
import { findLtiContext, upsertLtiContext } from '#/modules/auth/flows/lti/lti-contexts-queries';
import type { ltiFinishFormSchema } from '#/modules/auth/flows/lti/lti-schema';
import { findLaunchConnection, type LtiLaunch, validateLtiLaunch } from '#/modules/auth/flows/lti/operations/validate-lti-launch';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { addLtiDeployment } from '#/modules/connections/connections-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { channelIdColumnsOf } from '#/modules/memberships/helpers/membership-helpers';
import type { MembershipModel } from '#/modules/memberships/memberships-db';
import { findMembershipsByUserIdsAndChannel, updateMembershipRole } from '#/modules/memberships/memberships-queries';
import { insertMemberships } from '#/modules/memberships/operations/insert-memberships';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';
import { findIdentityBySubject, insertIdentity, updateIdentity } from '#/modules/user/identities-queries';
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
 * The account a launch acts for, found by its `lti` identity: the platform's issuer and `sub`. A first arrival gets an
 * account without a proven address, as an anonymous account is made, named as the platform released it. An email
 * claim is a display snapshot on the identity and never links an account.
 */
const launchingPersonId = async (ctx: DbContext, { connection, launch }: { connection: LtiConnection; launch: LtiLaunch }) => {
  const email = launch.email ?? null;
  const identity = await findIdentityBySubject(ctx, { kind: 'lti', provider: connection.issuer, subject: launch.sub });
  if (identity) {
    await updateIdentity(ctx, { id: identity.id, values: { lastSignInAt: getIsoDate(), connectionId: connection.id, email } });
    return identity.userId;
  }

  const { name: fullName, given_name: givenName, family_name: familyName } = launch;
  const name = fullName ?? ([givenName, familyName].filter(Boolean).join(' ') || i18n.t('c:anonymous'));
  const user = await insertAnonymousUser(ctx, { id: generateId(), name, slug: `lti-${nanoid(10)}`, givenName, familyName });
  const values = { userId: user.id, kind: 'lti' as const, provider: connection.issuer, subject: launch.sub, email, connectionId: connection.id };
  await insertIdentity(ctx, { values, verified: true });
  log.info('User provisioned through LTI', { userId: user.id, connectionId: connection.id });
  return user.id;
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
 * creates the person, applies the mapped role and records the context and a new LTI deployment, all in one
 * transaction. Then it starts the embedded session: no MFA challenge, the launch is the proof.
 * @returns The embedded page of the channel to redirect to.
 * @throws AppError 403 `lti_launch_cross_site` for a request the browser does not mark same-origin, 409
 *   `lti_context_not_set_up`, 409 `write_conflict` when another launch created the context's channel at once, and
 *   what `findLaunchConnection` and `validateLtiLaunch` throw.
 */
export async function finishLtiLaunchOp(ctx: Context<Env>, form: z.infer<typeof ltiFinishFormSchema>, frame: PageFrame): Promise<string> {
  if (ctx.req.header('Sec-Fetch-Site') !== 'same-origin') throw new AppError(403, 'lti_launch_cross_site', 'warn');
  const state = decodeLaunchState(form.state);
  const { id_token: token, storage_value: storageValue } = form;
  if (!state || !token || !storageValue) throw new AppError(401, 'lti_launch_invalid', 'warn', { meta: { rule: 'form' } });

  const { connection, header, claims } = await findLaunchConnection(token);
  frame.ancestor = new URL(connection.config.authorizationEndpoint).origin;
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

  const { userId, channel } = await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const userId = await launchingPersonId(txCtx, { connection, launch });
    const channel =
      'channel' in plan ? plan.channel : await createLtiContextChannel(txCtx, { organization, context: plan.create, createdBy: userId });

    if (context) {
      const { id: contextId, label, title, types } = context;
      const row = await upsertLtiContext(txCtx, {
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
        },
        by: userId,
      });
      // Another launch of the same course created its channel at the same moment: this one rolls back.
      if (row.channelId !== channel.id && 'create' in plan) throw new AppError(409, 'write_conflict', 'warn', { meta: { contextId: context.id } });
    }

    await applyLtiRole(txCtx, { userId, channel, role: ltiContextRole({ ltiRoles, connection }) });
    if (!connection.config.deploymentIds.includes(deploymentId)) await addLtiDeployment(txCtx, { id: connection.id, deploymentId, by: userId });
    return { userId, channel };
  });
  invalidateCache.user(userId);

  const user = await findUserById(dbCtx, { id: userId });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });
  await setEmbeddedSession(ctx, user, { connectionId: connection.id });

  log.info('LTI launch', { connectionId: connection.id, channelType: channel.entityType, channelId: channel.id });
  return embeddedPageUrl(channel);
}
