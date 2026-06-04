import type { AuthContext } from '#/core/context';
import { invalidateCache } from '#/middlewares/guard/invalidate-cache';
import { deleteOrganizationsByIds } from '#/modules/organization/organization-queries';
import { splitByPermission } from '#/permissions/split-by-permission';
import { logEvent } from '#/utils/logger';

export async function deleteOrganizationsOp(ctx: AuthContext, ids: string[], tenantId: string) {
  const toDeleteIds = Array.isArray(ids) ? ids : [ids];

  // Split ids into allowed and disallowed
  const { allowedIds, rejectedIds } = await splitByPermission(ctx, 'delete', 'organization', toDeleteIds);

  await deleteOrganizationsByIds(ctx, { ids: allowedIds });

  for (const id of allowedIds) invalidateCache.org(tenantId, id);

  logEvent(ctx, 'info', 'Organizations deleted', { count: allowedIds.length, ids: allowedIds });

  return { data: [], rejectedIds };
}
