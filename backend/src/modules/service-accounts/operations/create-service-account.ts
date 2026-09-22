import { count, eq } from 'drizzle-orm';
import { hierarchy } from 'shared';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { insertServiceAccount } from '#/modules/service-accounts/helpers/insert-service-accounts';
import { issueCredential } from '#/modules/service-accounts/helpers/issue-credential';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import type { CreateServiceAccountInput } from '#/modules/service-accounts/service-accounts-schema';
import { getValidChannel } from '#/permissions';
import { log } from '#/utils/logger';

/**
 * Organization admins create service accounts (D9). The account's role is capped at the creator's own: an admin may
 * bind `admin` or `member`, never more than they hold. Only humans get here: memberships and provenance stay theirs.
 */
export async function createServiceAccountOp(ctx: UserContext, input: CreateServiceAccountInput) {
  const { db, tenantId, organizationId, isSystemAdmin } = ctx.var;
  const creatorId = ctx.var.actor.id;

  const { membership } = await getValidChannel(ctx, organizationId, 'organization', 'update');

  const roles = hierarchy.getRoles('organization');
  const creatorRank = isSystemAdmin ? 0 : membership ? roles.indexOf(membership.role) : -1;
  if (creatorRank < 0 || roles.indexOf(input.role) < creatorRank) {
    throw new AppError(403, 'invalid_role', 'warn', { meta: { role: input.role } });
  }

  const quota = ctx.var.tenant.restrictions.quotas.serviceAccount;
  if (quota > 0) {
    const [{ value: existing }] = await db
      .select({ value: count() })
      .from(serviceAccountsTable)
      .where(eq(serviceAccountsTable.tenantId, tenantId));
    if (existing >= quota) throw new AppError(403, 'restrict_by_app', 'warn', { meta: { resource: 'serviceAccount' } });
  }

  const serviceAccount = await insertServiceAccount(db, {
    tenantId,
    name: input.name,
    description: input.description,
    grants: [{ channelType: 'organization', channelId: organizationId, organizationId, role: input.role }],
    createdBy: creatorId,
  });

  const issued = input.key
    ? await issueCredential(db, {
        principalId: serviceAccount.id,
        tenantId,
        name: input.key.name,
        description: input.key.description,
        scopes: input.key.scopes ?? null,
        expiresAt: input.key.expiresAt,
        createdBy: creatorId,
      })
    : null;

  log.info('Service account created', { serviceAccountId: serviceAccount.id, withKey: issued !== null });
  return {
    serviceAccount,
    ...(issued && { credential: { ...issued.credential, secret: issued.secret } }),
  };
}
