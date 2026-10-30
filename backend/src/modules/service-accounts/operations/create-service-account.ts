import type { UserContext } from '#/core/context';
import { withActorRef } from '#/modules/actors/actor-refs';
import { issueApiKey } from '#/modules/service-accounts/operations/issue-api-key';
import { countActiveServiceAccounts, insertServiceAccount } from '#/modules/service-accounts/service-accounts-queries';
import type { CreateServiceAccountInput } from '#/modules/service-accounts/service-accounts-schema';
import { assertTenantQuota } from '#/modules/tenants/tenant-restrictions';
import { getValidChannel } from '#/permissions';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { assertRoleGrant } from '#/permissions/role-grant';
import { log } from '#/utils/logger';

/**
 * The account's role is capped at the creator's own: never more than they hold. Only humans get here; memberships and
 * provenance of memberships stay theirs.
 */
export async function createServiceAccountOp(ctx: UserContext, input: CreateServiceAccountInput) {
  const { db, tenantId, organizationId } = ctx.var;
  const creatorId = ctx.var.actor.id;

  const { entity } = await getValidChannel(ctx, organizationId, 'organization', 'update');
  assertRoleGrant(ctx, { subject: buildSubjectFromEntity('organization', entity), role: input.role, action: 'update' });

  assertTenantQuota(ctx, 'serviceAccount', await countActiveServiceAccounts(ctx, { tenantId }));

  // Account and first key commit together: a failed key insert never leaves a keyless account behind.
  const { serviceAccount, apiKey: issued } = await db.transaction(async (tx) => {
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
    const apiKey = await issueApiKey(txCtx, { actorId: serviceAccount.id, tenantId, createdBy: creatorId, key: input.key });
    return { serviceAccount, apiKey };
  });

  log.info('Service account created', { serviceAccountId: serviceAccount.id, withKey: issued !== null });
  // A new account has authenticated nothing yet.
  const created = { ...(await withActorRef(ctx, serviceAccount)), lastSeenAt: null };
  if (!issued) return { serviceAccount: created };
  return { serviceAccount: created, apiKey: { ...(await withActorRef(ctx, issued.apiKey)), secret: issued.secret } };
}
