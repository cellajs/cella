import type { UserContext } from '#/core/context';
import { deleteConnectionOp } from '#/modules/connections/operations/delete-connection';
import { getValidChannel } from '#/permissions/get-valid-channel';

/**
 * Removes an LTI connection of the organization's tenant, for a caller who may update the organization.
 * @throws AppError 404 `not_found`, also for an SSO connection.
 */
export async function deleteLtiConnectionOp(ctx: UserContext, id: string) {
  await getValidChannel(ctx, ctx.var.organizationId, 'organization', 'update');
  await deleteConnectionOp(ctx, { id, kind: 'lti' });
}
