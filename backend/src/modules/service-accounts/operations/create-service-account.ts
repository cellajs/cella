import { hierarchy } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { insertServiceAccount } from '#/modules/service-accounts/helpers/insert-service-accounts';
import { issueApiKey } from '#/modules/service-accounts/helpers/issue-api-key';
import { requireOrgAdmin } from '#/modules/service-accounts/helpers/managed-service-account';
import { countServiceAccounts } from '#/modules/service-accounts/service-accounts-queries';
import type { CreateServiceAccountInput } from '#/modules/service-accounts/service-accounts-schema';
import { assertTenantQuota } from '#/modules/tenants/tenant-restrictions';
import { log } from '#/utils/logger';

/**
 * The account's role is capped at the creator's own: an admin may bind `admin` or `member`, never more than they
 * hold. Only humans get here; memberships and provenance of memberships stay theirs.
 */
export async function createServiceAccountOp(ctx: UserContext, input: CreateServiceAccountInput) {
  const { db, tenantId, organizationId, isSystemAdmin } = ctx.var;
  const creatorId = ctx.var.actor.id;

  const { membership } = await requireOrgAdmin(ctx);
  // Roles are listed most-privileged first; a lower index is a higher role.
  const roles = hierarchy.getRoles('organization');
  const creatorRank = isSystemAdmin ? 0 : membership ? roles.indexOf(membership.role) : -1;
  if (creatorRank < 0 || roles.indexOf(input.role) < creatorRank) {
    throw new AppError(403, 'forbidden', 'warn', { meta: { reason: 'role_exceeds_creator', role: input.role } });
  }

  assertTenantQuota(ctx, 'serviceAccount', await countServiceAccounts(ctx, { tenantId }));

  // Account and first key land together: a failed key issue never leaves a keyless account behind.
  const { serviceAccount, issued } = await db.transaction(async (tx) => {
    const serviceAccount = await insertServiceAccount(tx, {
      tenantId,
      name: input.name,
      description: input.description,
      bindings: [{ channelType: 'organization', channelId: organizationId, organizationId, role: input.role }],
      createdBy: creatorId,
    });
    const issued = input.key
      ? await issueApiKey(tx, {
          principalId: serviceAccount.id,
          tenantId,
          name: input.key.name,
          description: input.key.description,
          scopes: input.key.scopes ?? null,
          expiresAt: input.key.expiresAt,
          createdBy: creatorId,
        })
      : null;
    return { serviceAccount, issued };
  });

  log.info('Service account created', { serviceAccountId: serviceAccount.id, withKey: issued !== null });
  return {
    serviceAccount,
    ...(issued && { apiKey: { ...issued.apiKey, secret: issued.secret } }),
  };
}
