import type { AccessScope } from 'shared';
import type { DbContext, UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { withActorRef } from '#/modules/actors/actor-refs';
import { requestedFields } from '#/modules/lti-platform/helpers/platform-offer';
import type { LtiReleasableField } from '#/modules/lti-platform/lti-installations-db';
import {
  approveLtiInstallation,
  deleteTenantLtiRegistration,
  type LtiInstallationRecord,
  lockLtiInstallation,
  updateLtiInstallationScopes,
} from '#/modules/lti-platform/lti-platform-queries';
import { ltiToolScopes } from '#/modules/lti-platform/lti-platform-routes';
import { toLtiInstallation } from '#/modules/lti-platform/operations/get-lti-installations';
import { getManagedServiceAccount } from '#/modules/service-accounts/operations/get-managed-service-account';
import { countActiveServiceAccounts } from '#/modules/service-accounts/service-accounts-queries';
import { assertTenantQuota } from '#/modules/tenants/tenant-restrictions';
import { log } from '#/utils/logger';

/**
 * The pending installation a decision is about, locked in the caller's transaction.
 * @throws AppError 404 `not_found` for no LTI installation of the tenant, 409 `lti_installation_not_pending` once decided.
 */
const lockPendingInstallation = async (txCtx: DbContext, { id, tenantId }: { id: string; tenantId: string }) => {
  const found = await lockLtiInstallation(txCtx, { id, tenantId });
  if (!found) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'ltiInstallation' } });
  if (found.account.status !== 'pending') throw new AppError(409, 'lti_installation_not_pending', 'warn', { meta: { installationId: id } });
  return found;
};

/**
 * Refuses a grant of a scope the LTI tool did not ask for in its registration, or that no route for installed LTI
 * tools reads (`ltiToolScopes`).
 * @throws AppError 400 `lti_scope_not_grantable` naming the first such scope.
 */
const assertScopesGrantable = ({ client }: Pick<LtiInstallationRecord, 'client'>, grantedScopes: AccessScope[]) => {
  const refused = grantedScopes.find((scope) => !client.requestedScopes?.includes(scope) || !ltiToolScopes.includes(scope));
  if (refused) throw new AppError(400, 'lti_scope_not_grantable', 'warn', { meta: { scope: refused } });
};

interface LtiInstallationDecision {
  releasedFields: LtiReleasableField[];
  grantedScopes?: AccessScope[];
}

/**
 * Approves a pending installation: its service account becomes active, its launches may carry the released personal
 * fields and its own tokens the granted scopes. An approval only narrows: it releases no field whose claims the LTI
 * tool did not ask for, and grants no scope it did not ask for. Who may decide is who may manage the installation's
 * service account (`getManagedServiceAccount`).
 * @throws AppError 400 `lti_field_not_requested` or `lti_scope_not_grantable`, 403 when the tenant's service account
 *   quota is spent, and what `getManagedServiceAccount` and `lockPendingInstallation` throw.
 */
export async function approveLtiInstallationOp(ctx: UserContext, id: string, { releasedFields, grantedScopes = [] }: LtiInstallationDecision) {
  const { tenantId } = ctx.var;
  await getManagedServiceAccount(ctx, id);

  const approved = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const found = await lockPendingInstallation(txCtx, { id, tenantId });
    const requested = requestedFields(found.client.ltiToolConfig.claims);
    const unrequested = releasedFields.find((field) => !requested.includes(field));
    if (unrequested) throw new AppError(400, 'lti_field_not_requested', 'warn', { meta: { field: unrequested } });
    assertScopesGrantable(found, grantedScopes);
    assertTenantQuota(ctx, 'serviceAccount', await countActiveServiceAccounts(txCtx, { tenantId }));

    const { stamps, decision } = await approveLtiInstallation(txCtx, { id, tenantId, releasedFields, grantedScopes, by: ctx.var.actor.id });
    return { ...found, account: { ...found.account, status: 'active' as const, ...stamps }, installation: { ...found.installation, ...decision } };
  });
  invalidateCache.serviceAccount(approved.account);

  log.info('LTI installation approved', { installationId: id, tenantId, releasedFields, grantedScopes });
  return withActorRef(ctx, toLtiInstallation(approved));
}

/**
 * Changes the access scopes an approved installation's own tokens may carry, each one the LTI tool asked for; the same
 * scopes write nothing. A token minted before rests on the scopes it carries: one that loses a scope is refused at its
 * next request, by the guard. Who may change them is who may approve.
 * @throws AppError 400 `lti_scope_not_grantable`, 404 `not_found` for no LTI installation of the tenant, 409
 *   `lti_installation_not_approved` while it waits for an approval, and what `getManagedServiceAccount` throws.
 */
export async function updateLtiInstallationOp(ctx: UserContext, id: string, { grantedScopes }: { grantedScopes?: AccessScope[] }) {
  const { tenantId } = ctx.var;
  await getManagedServiceAccount(ctx, id);

  const updated = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const found = await lockLtiInstallation(txCtx, { id, tenantId });
    if (!found) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'ltiInstallation' } });
    if (!found.installation.approvedAt) throw new AppError(409, 'lti_installation_not_approved', 'warn', { meta: { installationId: id } });
    if (!grantedScopes) return found;
    assertScopesGrantable(found, grantedScopes);
    const [stored, granted] = [new Set(found.installation.grantedScopes), new Set(grantedScopes)];
    if (granted.size === stored.size && grantedScopes.every((scope) => stored.has(scope))) return found;
    const written = await updateLtiInstallationScopes(txCtx, { id, grantedScopes, by: ctx.var.actor.id });
    return { ...found, installation: { ...found.installation, ...written } };
  });

  log.info('LTI installation updated', { installationId: id, tenantId, grantedScopes: updated.installation.grantedScopes });
  return withActorRef(ctx, toLtiInstallation(updated));
}

/**
 * Rejects a pending installation, which never acted: it is deleted with the registration private to the tenant. Its
 * actor stays as a bare id, as a deleted account's does.
 * @throws AppError what `getManagedServiceAccount` and `lockPendingInstallation` throw.
 */
export async function rejectLtiInstallationOp(ctx: UserContext, id: string) {
  const { tenantId } = ctx.var;
  await getManagedServiceAccount(ctx, id);

  const rejected = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const found = await lockPendingInstallation(txCtx, { id, tenantId });
    await deleteTenantLtiRegistration(txCtx, { id: found.client.id, tenantId });
    return found;
  });
  invalidateCache.serviceAccount(rejected.account);

  log.info('LTI installation rejected', { installationId: id, tenantId, clientId: rejected.client.id });
}

/**
 * Deletes an installation in any state, as a rejection deletes a pending one: its registration private to the tenant,
 * and with it the service account, its side row, its tabs and their live launch records. Its tokens rest on the
 * installation, which the guard reads at every request. Its account is not kept the way a connection's import account
 * is: its routes only read, and no row names it as its writer.
 * @throws AppError 404 `not_found` for no LTI installation of the tenant, and what `getManagedServiceAccount` throws.
 */
export async function deleteLtiInstallationOp(ctx: UserContext, id: string) {
  const { tenantId } = ctx.var;
  await getManagedServiceAccount(ctx, id);

  const deleted = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const found = await lockLtiInstallation(txCtx, { id, tenantId });
    if (!found) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'ltiInstallation' } });
    await deleteTenantLtiRegistration(txCtx, { id: found.client.id, tenantId });
    return found;
  });
  invalidateCache.serviceAccount(deleted.account);

  log.info('LTI installation deleted', { installationId: id, tenantId, clientId: deleted.client.id, status: deleted.account.status });
}
