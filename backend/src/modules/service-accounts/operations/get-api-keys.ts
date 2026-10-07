import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { findApiKeysByActor, findServiceAccountInTenant } from '#/modules/service-accounts/service-accounts-queries';
import { getValidChannel } from '#/permissions';
import { withApiKeyCreators } from './with-api-key-creators';

export async function getApiKeysOp(ctx: UserContext, serviceAccountId: string) {
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  const account = await findServiceAccountInTenant(ctx, { id: serviceAccountId, tenantId: ctx.var.tenantId });
  if (!account) throw new AppError(404, 'not_found', 'warn', { meta: { resource: 'serviceAccount' } });
  return { items: await withApiKeyCreators(ctx, await findApiKeysByActor(ctx, { actorId: account.id })) };
}
