import type { z } from '@hono/zod-openapi';
import type { AuthContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { resolveUpdateOps } from '#/core/stx';
import { updatePage } from '#/modules/page/page-queries';
import type { pageUpdateStxBodySchema } from '#/modules/page/page-schema';
import { withAuditUser, withAuditUserLite } from '#/modules/user/helpers/audit-user';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { extractKeywords } from '#/utils/extract-keywords';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';

type UpdatePageInput = z.infer<typeof pageUpdateStxBodySchema>;

export async function updatePageOp(
  ctx: AuthContext,
  id: string,
  input: UpdatePageInput,
  opts: { fullResponse?: boolean },
) {
  const { ops, stx } = input;
  const { fullResponse } = opts;
  const user = ctx.var.user;

  const { entity } = await getValidProductEntity(ctx, id, 'page', 'update');
  const resolved = resolveUpdateOps(entity, ops, stx);

  if (!resolved.changed) {
    const pageResponse = fullResponse ? await withAuditUser(ctx, entity, user) : withAuditUserLite(entity, user);
    return { success: true, data: pageResponse } as OperationResult<typeof pageResponse>;
  }

  const updatedName = resolved.values.name ?? entity.name;
  const updatedDesc = resolved.values.description ?? entity.description;

  const values = {
    ...resolved.values,
    keywords: extractKeywords(updatedName, updatedDesc),
    updatedAt: getIsoDate(),
    updatedBy: user.id,
    stx: resolved.stx,
  };
  const updatedPageRecord = await updatePage(ctx, { id, values });
  logEvent(ctx, 'info', 'Page updated', { pageId: updatedPageRecord.id });

  const pageResponse = fullResponse
    ? await withAuditUser(ctx, updatedPageRecord, user)
    : withAuditUserLite(updatedPageRecord, user);
  return { success: true, data: pageResponse } as OperationResult<typeof pageResponse>;
}
