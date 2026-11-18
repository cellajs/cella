import type { DbContext, UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { withActorRef } from '#/modules/actors/actor-refs';
import { requestedFields } from '#/modules/lti-platform/helpers/platform-offer';
import type { LtiReleasableField } from '#/modules/lti-platform/lti-installations-db';
import { approveLtiInstallation, deleteTenantLtiRegistration, lockLtiInstallation } from '#/modules/lti-platform/lti-platform-queries';
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
 * Approves a pending installation: its service account becomes active and its launches may carry the released
 * personal fields. An approval only narrows: it releases no field whose claims the LTI tool did not ask for. Who may
 * decide is who may manage the installation's service account (`getManagedServiceAccount`).
 * @throws AppError 400 `lti_field_not_requested`, 403 when the tenant's service account quota is spent, and what
 *   `getManagedServiceAccount` and `lockPendingInstallation` throw.
 */
export async function approveLtiInstallationOp(ctx: UserContext, id: string, { releasedFields }: { releasedFields: LtiReleasableField[] }) {
  const { tenantId } = ctx.var;
  await getManagedServiceAccount(ctx, id);

  const approved = await ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const found = await lockPendingInstallation(txCtx, { id, tenantId });
    const requested = requestedFields(found.client.ltiToolConfig.claims);
    const unrequested = releasedFields.find((field) => !requested.includes(field));
    if (unrequested) throw new AppError(400, 'lti_field_not_requested', 'warn', { meta: { field: unrequested } });
    assertTenantQuota(ctx, 'serviceAccount', await countActiveServiceAccounts(txCtx, { tenantId }));

    const { stamps, decision } = await approveLtiInstallation(txCtx, { id, tenantId, releasedFields, by: ctx.var.actor.id });
    return { ...found, account: { ...found.account, status: 'active' as const, ...stamps }, installation: { ...found.installation, ...decision } };
  });
  invalidateCache.serviceAccount(approved.account);

  log.info('LTI installation approved', { installationId: id, tenantId, releasedFields });
  return withActorRef(ctx, toLtiInstallation(approved));
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
