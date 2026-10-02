import type { ProductEntityType } from 'shared';
import type { OrgContext } from '#/core/context';
import { authorizeYjsEditor } from '#/modules/yjs/operations/authorize-yjs-editor';
import { signYjsToken } from '../helpers/token-signer';

/**
 * Signs a Yjs token for one product entity the caller may collaboratively edit (`authorizeYjsEditor`). The claims are
 * the caller and the document's scope as the entity row states it: the relay trusts every claim, so none is taken
 * from the query.
 * @param ctx - A user acting in a resolved organization.
 * @param params - The entity to edit.
 * @returns The signed token.
 */
export async function getYjsTokenOp(ctx: OrgContext, params: { entityType: ProductEntityType; entityId: string }) {
  const doc = await authorizeYjsEditor(ctx, params);

  const token = signYjsToken({
    userId: ctx.var.actor.id,
    entityType: params.entityType,
    entityId: doc.entityId,
    tenantId: doc.tenantId,
    organizationId: doc.organizationId,
  });

  return { token };
}
