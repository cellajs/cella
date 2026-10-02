import type { ProductEntityType } from 'shared';
import type { OrgContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { YjsDocScope } from '#/modules/yjs/helpers/yjs-log';
import { checkAccess } from '#/permissions';
import { accessFrom } from '#/permissions/access';
import { buildSubjectFromEntity } from '#/permissions/build-subject';
import { getValidProduct } from '#/permissions/get-valid-product';

interface AuthorizeYjsEditorOpts {
  entityType: ProductEntityType;
  entityId: string;
}

/**
 * Checks that the caller may collaboratively edit one product entity, for the token, pull and push routes alike, and
 * returns its document's scope as the entity row states it: the relay and the log trust that scope, so none of it is
 * taken from the request. A foreign tenant is refused by tenantGuard; a missing or soft-deleted row, or one outside the
 * request's tenant and organization, reads as 404 (deleted, to a client); a row the caller may read but not update
 * answers 403 (view only). Collaborative editing confers no system-admin bypass, as the relay authorizes the socket:
 * a system admin whose memberships do not grant update gets a 403 and edits without the relay.
 * @param ctx - A user acting in a resolved organization.
 * @param opts - The entity to edit.
 * @returns The document's scope, from the entity row.
 */
export async function authorizeYjsEditor(ctx: OrgContext, { entityType, entityId }: AuthorizeYjsEditorOpts): Promise<YjsDocScope> {
  const { entity } = await getValidProduct(ctx, entityId, entityType, 'update');

  const access = accessFrom(ctx);
  const subject = buildSubjectFromEntity(entityType, entity);
  if ('anonymous' in access || !checkAccess({ ...access, isSystemAdmin: false }, 'update', subject).allowed) {
    throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { action: 'update' } });
  }

  return { entityType, entityId: entity.id, tenantId: entity.tenantId, organizationId: entity.organizationId };
}
