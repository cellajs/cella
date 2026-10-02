import { type EntityRole, hierarchy } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { generateApiKey } from '#/modules/service-accounts/helpers/api-key';
import { countServiceAccounts, insertApiKey, insertServiceAccount } from '#/modules/service-accounts/service-accounts-queries';
import type { CreateServiceAccountInput } from '#/modules/service-accounts/service-accounts-schema';
import { assertTenantQuota } from '#/modules/tenants/tenant-restrictions';
import { getValidChannel } from '#/permissions';
import { log } from '#/utils/logger';

/**
 * The account's role is capped at the creator's own: an admin may bind `admin` or `member`, never more than they
 * hold. Only humans get here; memberships and provenance of memberships stay theirs.
 */
export async function createServiceAccountOp(ctx: UserContext, input: CreateServiceAccountInput) {
  const { db, tenantId, organizationId, isSystemAdmin } = ctx.var;
  const creatorId = ctx.var.actor.id;

  const { membership } = await getValidChannel(ctx, organizationId, 'organization', 'update');
  // Roles are listed most-privileged first; a lower index is a higher role. Widened: a membership's role type also
  // spans channel roles the organization does not declare.
  const roles: readonly EntityRole[] = hierarchy.getRoles('organization');
  const creatorRank = isSystemAdmin ? 0 : membership ? roles.indexOf(membership.role) : -1;
  if (creatorRank < 0 || roles.indexOf(input.role) < creatorRank) {
    throw new AppError(403, 'forbidden', 'warn', { meta: { reason: 'role_exceeds_creator', role: input.role } });
  }

  assertTenantQuota(ctx, 'serviceAccount', await countServiceAccounts(ctx, { tenantId }));

  // Account and first key land together: a failed key insert never leaves a keyless account behind.
  const { serviceAccount, apiKey } = await db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    const serviceAccount = await insertServiceAccount(txCtx, {
      values: {
        tenantId,
        name: input.name,
        bindings: [{ channelType: 'organization', channelId: organizationId, organizationId, role: input.role }],
        createdBy: creatorId,
      },
    });
    if (!input.key) return { serviceAccount, apiKey: null };

    const { key: secret, parsed } = generateApiKey('secret');
    const apiKey = await insertApiKey(txCtx, {
      values: {
        actorId: serviceAccount.id,
        tenantId,
        name: input.key.name,
        scopes: input.key.scopes ?? null,
        expiresAt: input.key.expiresAt,
        createdBy: creatorId,
        ...parsed,
      },
    });
    return { serviceAccount, apiKey: { ...apiKey, secret } };
  });

  log.info('Service account created', { serviceAccountId: serviceAccount.id, withKey: apiKey !== null });
  return { serviceAccount, ...(apiKey && { apiKey }) };
}
