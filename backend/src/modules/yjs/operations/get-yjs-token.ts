import type { ProductEntityType } from 'shared';
import type { OrgContext } from '#/core/context';
import { getValidProduct } from '#/permissions/get-valid-product';
import { signYjsToken } from '../helpers/token-signer';

/**
 * Signs a Yjs token for one product entity the caller may update. The claims come from the entity row as the guards
 * scoped it: a foreign tenant is refused by tenantGuard, a row outside the request's tenant and organization reads as
 * 404, and a row the caller may not update answers 403. The relay trusts every claim, so none is taken from the query.
 * @param ctx - A user acting in a resolved organization.
 * @param params - The entity to edit.
 * @returns The signed token.
 */
export async function getYjsTokenOp(ctx: OrgContext, params: { entityType: ProductEntityType; entityId: string }) {
  const { entity } = await getValidProduct(ctx, params.entityId, params.entityType, 'update');

  const token = signYjsToken({
    userId: ctx.var.actor.id,
    entityType: params.entityType,
    entityId: entity.id,
    tenantId: entity.tenantId,
    organizationId: entity.organizationId,
  });

  return { token };
}
