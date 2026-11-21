import type { z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { appConfig, buildSubject, type ChannelEntityType, checkAccess, hierarchy, type RestrictionCap } from 'shared';
import { embeddedHandoffKey } from 'shared/utils/embedded-session';
import { generateId } from 'shared/utils/entity-id';
import { buildNotificationPath } from 'shared/utils/notification-link';
import type { DbContext, Env } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import type { UserId } from '#/db/utils/ids';
import { ltiClaims } from '#/lib/lti-vocabulary';
import type { MembershipEntity } from '#/lib/module';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { setEmbeddedSession } from '#/modules/auth/core/sessions/operations/create-session';
import { decodeLaunchState } from '#/modules/auth/flows/lti/helpers/launch-state';
import { launchMembershipsUrl } from '#/modules/auth/flows/lti/helpers/platform-memberships';
import { createLtiContextChannel, type LtiContext, ltiContextChannelType } from '#/modules/auth/flows/lti/lti-context-channel';
import { findLtiContext, upsertLtiContext } from '#/modules/auth/flows/lti/lti-contexts-queries';
import type { ltiFinishFormSchema } from '#/modules/auth/flows/lti/lti-schema';
import { admitLtiPerson, applyLtiRole, ltiRoleIn, signInKnownLtiMember } from '#/modules/auth/flows/lti/operations/admit-lti-person';
import type { LtiPerson } from '#/modules/auth/flows/lti/operations/create-lti-account';
import { requestLtiMemberImport } from '#/modules/auth/flows/lti/operations/import-lti-members';
import { findLaunchConnection, validateLtiLaunch } from '#/modules/auth/flows/lti/operations/validate-lti-launch';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { addLtiDeployment } from '#/modules/connections/connections-queries';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { channelIdColumnsOf } from '#/modules/memberships/helpers/membership-helpers';
import type { MembershipModel } from '#/modules/memberships/memberships-db';
import { findMembershipsByUserIdsAndChannel } from '#/modules/memberships/memberships-queries';
import type { OrganizationModel } from '#/modules/organization/organization-db';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { findTenant } from '#/modules/tenants/tenants-queries';
import { findUserById } from '#/modules/user/user-queries';
import { accessFrom, membershipActorVars } from '#/permissions/access';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';

const dbCtx = { var: { db: baseDb } };

/**
 * Whether the role `ltiRoleIn` gives a person sets a context of `channelType` up: creates its channel on the first
 * launch and starts its member import. The permission engine judges the role alone, on a channel of that type that
 * need not exist yet: a grant from a channel above or through a row condition does not count.
 */
export const setsUpLtiContext = (organizationId: string, channelType: ChannelEntityType, role: MembershipModel['role']) => {
  const channelId = generateId();
  const ancestors = Object.fromEntries(hierarchy.getOrderedAncestors(channelType).map((type) => [appConfig.entityIdColumnKeys[type], null]));
  const subject = buildSubject(channelType, { ...ancestors, organizationId }, { id: channelId });
  // The person may have no account yet: a fresh id stands in, and no row condition reads it.
  const access = accessFrom({ var: membershipActorVars(generateId(), [{ channelType, channelId, organizationId, role }]) });
  return checkAccess(access, 'update', subject).allowed;
};

/** Where a launch's context leads: a channel the app has, or a context whose channel of `channelType` this launch creates. */
type ContextPlan = { channel: MembershipEntity } | { create: LtiContext; channelType: ChannelEntityType };

/**
 * The channel a context's row in the connection's tenant names, also when another registration of the platform launched
 * it before: a context keeps it whatever types a later launch sends. Undefined before it has one, or once it is gone.
 */
export const storedLtiContextChannel = async (
  ctx: DbContext,
  { connection, context }: { connection: Pick<LtiConnection, 'tenantId' | 'issuer'>; context: Pick<LtiContext, 'id'> },
) => {
  const row = await findLtiContext(ctx, { tenantId: connection.tenantId, issuer: connection.issuer, contextId: context.id });
  return row && (await resolveEntity(ctx, { entityType: row.channelType, identifier: row.channelId }));
};

interface PlanLtiContextChannelOpts {
  connection: Pick<LtiConnection, 'id'>;
  context: LtiContext;
  /** What `ltiContextChannelType` answers for the context: the type a launch that sets it up creates. */
  channelType: ChannelEntityType;
  /** Whether the person sets the context up (`setsUpLtiContext`). */
  setsUp: boolean;
}

/**
 * Plans the channel of a context below the organization that has none yet: only someone who sets the context up may
 * arrive, and the launch creates it.
 * @throws AppError 409 `lti_context_not_set_up` for anyone else.
 */
export const planLtiContextChannel = ({ connection, context, channelType, setsUp }: PlanLtiContextChannelOpts): ContextPlan => {
  if (setsUp) return { create: context, channelType };
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

/** Who launches, through which connection, and when. */
interface LaunchFacts {
  connection: LtiConnection;
  organization: OrganizationModel;
  person: LtiPerson;
  signedInAt: string;
}

/** What a launch with a context enters: the plan for its channel and the role it gives there. */
interface ContextEntry {
  context: LtiContext;
  plan: ContextPlan;
  role: MembershipModel['role'];
}

interface EnterLtiContextOpts extends LaunchFacts {
  memberQuota: RestrictionCap;
  /** The membership address the launch names, when the app trusts it (`launchMembershipsUrl`). */
  membershipsUrl: string | undefined;
  entry: ContextEntry;
}

/**
 * Admits the person of a launch with a context (`admitLtiPerson`) into its channel, created now where the plan says so,
 * applies their role (`applyLtiRole`) and records the context with the membership address it trusts. A context another
 * live connection holds is only read for its channel (`upsertLtiContext`). In an archived channel a member keeps their
 * role. Runs inside the launch's transaction.
 * @throws AppError 403 `lti_member_limit`, 403 `channel_archived`, 409 `write_conflict`, as `finishLtiLaunchOp` names them.
 */
const enterLtiContext = async (
  txCtx: DbContext,
  { connection, organization, memberQuota, person, signedInAt, membershipsUrl, entry }: EnterLtiContextOpts,
) => {
  const { context, plan, role } = entry;
  const admitted = await admitLtiPerson(txCtx, { connection, organization, memberQuota, person, signedInAt });
  if (!admitted) throw new AppError(403, 'lti_member_limit', 'warn', { meta: { connectionId: connection.id } });
  const { userId, seat } = admitted;
  const channel =
    'channel' in plan
      ? plan.channel
      : await createLtiContextChannel(txCtx, { organization, context: plan.create, channelType: plan.channelType, createdBy: userId });

  const { id: contextId, label, title, types } = context;
  const contextRow = await upsertLtiContext(txCtx, {
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
  // Another launch of the same context created its channel at the same moment: this one rolls back.
  if ('create' in plan && contextRow?.channelId !== channel.id) throw new AppError(409, 'write_conflict', 'warn', { meta: { contextId } });

  // Joining an archived channel is a create inside it, which an archive refuses; a member keeps the role they hold.
  if (channel.archived) {
    const [membership] = await findMembershipsByUserIdsAndChannel(txCtx, { userIds: [userId], channelId: channel.id });
    if (!membership) throw new AppError(403, 'channel_archived', 'warn', { entityType: channel.entityType });
  } else {
    // A context another registration of the platform holds is the same place there: its row records what this gives.
    const heldRow = contextRow ?? (await findLtiContext(txCtx, { tenantId: connection.tenantId, issuer: connection.issuer, contextId }));
    if (!heldRow) throw new AppError(409, 'write_conflict', 'warn', { meta: { contextId } });
    await applyLtiRole(txCtx, { organization, contextId: heldRow.id, listed: false, channel, userId, seat, role, by: userId });
  }
  return { userId, channel, contextRow };
};

/**
 * Signs in the person of a launch without a context when the tenant knows them as a member (`signInKnownLtiMember`).
 * @throws AppError 403 `lti_launch_no_context` for anyone else, with nothing written.
 */
const enterWithoutContext = async (txCtx: DbContext, facts: LaunchFacts) => {
  const userId = await signInKnownLtiMember(txCtx, facts);
  if (!userId) throw new AppError(403, 'lti_launch_no_context', 'info', { meta: { connectionId: facts.connection.id } });
  return { userId, channel: facts.organization, contextRow: undefined };
};

/**
 * Records a launch's deployment on its connection at the first launch from it: validation let a new one through below
 * the cap, and other launches may have added deployments since.
 * @throws AppError 403 `lti_deployment_unknown` when the connection reached its cap meanwhile.
 */
const recordLtiDeployment = async (
  txCtx: DbContext,
  { connection, deploymentId, by }: { connection: LtiConnection; deploymentId: string; by: UserId },
) => {
  if (connection.config.deploymentIds.includes(deploymentId) || (await addLtiDeployment(txCtx, { id: connection.id, deploymentId, by }))) return;
  throw new AppError(403, 'lti_deployment_unknown', 'warn', { meta: { rule: 'deployment_id', connectionId: connection.id } });
};

/**
 * Finishes a launch at the app as an LTI tool, posted same-origin by the launch page with the value the frame kept.
 * Checks the launch (`validateLtiLaunch`) and maps its context to a channel type (`ltiContextChannelType`). A
 * launch with a context maps the person to a role there (`ltiContextRole`) and enters it (`enterLtiContext`). A launch
 * without one admits nobody new: it signs in only a member the tenant knows from an earlier launch or an import
 * (`signInKnownLtiMember`) and writes no membership, role or seat. Either records an LTI deployment the connection does
 * not hold yet, in the same transaction, and starts the embedded session: no MFA challenge, the launch is the proof. A
 * launch by someone who sets the context up (`setsUpLtiContext`), through the connection that holds it, asks for a
 * member import (`requestLtiMemberImport`) without waiting for it.
 * @returns The embedded page of the channel to redirect to, with the embedded session's handoff code in its fragment.
 * @throws AppError 403 `lti_launch_cross_site` for a request the browser does not mark same-origin, 403
 *   `lti_launch_no_context` for a launch without a context by a person the tenant does not know as a member, 403
 *   `lti_launch_no_roles` for a person `ltiContextRole` maps to no role, 403 `channel_archived` for a person the launch
 *   would add to an archived channel, 403 `lti_member_limit` for a person who needs a seat while none is left, 403
 *   `lti_deployment_unknown` when the connection reached its cap of deployments meanwhile, 409 `lti_context_not_set_up`,
 *   409 `write_conflict` when another launch created the context's channel at once, and what `findLaunchConnection` and
 *   `validateLtiLaunch` throw.
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
  // A context with a channel keeps it; the app maps only one that has none yet, and its null counts as no context.
  const stored = context && (await storedLtiContextChannel(dbCtx, { connection, context }));
  const channelType = stored ? stored.entityType : context ? ltiContextChannelType(context) : null;
  // Decided before any account exists: whoever arrives at a context nobody set up yet, or with no role there, leaves nothing behind.
  let entry: ContextEntry | undefined;
  let setsUp = false;
  if (context && channelType) {
    const role = ltiRoleIn(channelType, { ltiRoles, connection });
    setsUp = !!role && setsUpLtiContext(organization.id, channelType, role);
    const plan: ContextPlan = stored
      ? { channel: stored }
      : channelType === 'organization'
        ? { channel: organization }
        : planLtiContextChannel({ connection, context, channelType, setsUp });
    if (!role) throw new AppError(403, 'lti_launch_no_roles', 'info', { meta: { connectionId: connection.id } });
    entry = { context, plan, role };
  }
  const deploymentId = launch[ltiClaims.deploymentId];
  const { sub, name, given_name: givenName, family_name: familyName, email } = launch;
  const person = { sub, name, givenName, familyName, email };

  const { userId, channel, contextRow } = await baseDb.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const facts = { connection, organization, person, signedInAt: getIsoDate() };
    const entered = entry
      ? await enterLtiContext(txCtx, { ...facts, memberQuota: tenant.restrictions.quotas.user, membershipsUrl: launchMembershipsUrl(claims), entry })
      : await enterWithoutContext(txCtx, facts);
    await recordLtiDeployment(txCtx, { connection, deploymentId, by: entered.userId });
    return entered;
  });
  invalidateCache.user(userId);
  if (contextRow && setsUp) void requestLtiMemberImport(contextRow, userId);

  const user = await findUserById(dbCtx, { id: userId });
  if (!user) throw new AppError(404, 'not_found', 'warn', { entityType: 'user' });
  const handoffCode = await setEmbeddedSession(ctx, user, { connectionId: connection.id });

  log.info('LTI launch', { connectionId: connection.id, channelType: channel.entityType, channelId: channel.id, context: !!entry });
  // The fragment never reaches a server or a Referer, and the page takes it out of its address before anything reads it.
  return `${embeddedPageUrl(channel)}#${new URLSearchParams({ [embeddedHandoffKey]: handoffCode })}`;
}
