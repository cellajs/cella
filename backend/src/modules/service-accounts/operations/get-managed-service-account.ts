import { buildSubjectFromEntity } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { organizationRole } from '#/modules/service-accounts/helpers/organization-role';
import { findServiceAccountInTenant } from '#/modules/service-accounts/service-accounts-queries';
import { getValidChannel } from '#/permissions/get-valid-channel';
import { assertRoleGrant } from '#/permissions/role-grant';

/**
 * The service account a management route names, with its activity time. Who may manage a machine actor is one rule:
 * the caller may update the organization, checked before the account is read, and could grant the account's
 * organization role (`assertRoleGrant`), so a key, a roll or a re-enable never hands out more than the caller holds.
 * @throws AppError 404 `not_found` (`meta.resource: 'serviceAccount'`) for an account of another tenant or none.
 * @throws AppError 403 `forbidden` (`meta.reason: 'role_exceeds_actor'`) for an account whose role outranks the caller's.
 */
export async function getManagedServiceAccount(ctx: UserContext, serviceAccountId: string) {
  const { entity } = await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const account = await findServiceAccountInTenant(ctx, { id: serviceAccountId, tenantId: ctx.var.tenantId });
  if (!account) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });
  assertRoleGrant(ctx, { subject: buildSubjectFromEntity('organization', entity), role: organizationRole(account), action: 'update' });
  return account;
}
