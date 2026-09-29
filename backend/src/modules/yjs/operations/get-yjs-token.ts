import type { ProductEntityType } from 'shared';
import type { OrgContext } from '#/core/context';
import { AppError } from '#/core/error';
import { checkAccess } from '#/permissions';
import { accessFrom } from '#/permissions/access';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { getValidProduct } from '#/permissions/get-valid-product';
import { signYjsToken } from '../helpers/token-signer';

/**
 * Signs a Yjs token for one product entity the caller may update. The claims come from the entity row as the guards
 * scoped it: a foreign tenant is refused by tenantGuard, a row outside the request's tenant and organization reads as
 * 404, and a row the caller may not update answers 403. The relay trusts every claim, so none is taken from the query.
 * Collaborative editing confers no system-admin bypass, as the relay authorizes the socket: a system admin whose
 * memberships do not grant update gets a 403 here and edits without the relay.
 * @param ctx - A user acting in a resolved organization.
 * @param params - The entity to edit.
 * @returns The signed token.
 */
export async function getYjsTokenOp(ctx: OrgContext, params: { entityType: ProductEntityType; entityId: string }) {
  const { entity } = await getValidProduct(ctx, params.entityId, params.entityType, 'update');

  const access = accessFrom(ctx);
  const subject = buildSubjectFromEntity(params.entityType, entity);
  if ('anonymous' in access || !checkAccess({ ...access, isSystemAdmin: false }, 'update', subject).allowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType: params.entityType, meta: { action: 'update' } });
  }

  const token = signYjsToken({
    userId: ctx.var.actor.id,
    entityType: params.entityType,
    entityId: entity.id,
    tenantId: entity.tenantId,
    organizationId: entity.organizationId,
  });

  return { token };
}
