import type { z } from '@hono/zod-openapi';
import type { SQL } from 'drizzle-orm';
import type { OrgContext } from '#/core/context';
import { tenantRead, tenantReadIncludingDeleted } from '#/db/tenant-context';
import { requestScopeWhere } from '#/db/utils/request-scope';
import { buildSubtreeCoverWhere } from '#/db/utils/subtree-cover';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { findAttachmentsPaginated } from '#/modules/attachment/attachment-queries';
import type { attachmentListQuerySchema } from '#/modules/attachment/attachment-schema';
import { coalesceAuditUsers } from '#/modules/user/helpers/audit-user';
import { actorFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';

type GetAttachmentsInput = z.infer<typeof attachmentListQuerySchema>;

export async function getAttachmentsOp(ctx: OrgContext, input: GetAttachmentsInput) {
  const organizationId = ctx.var.organization.id;
  const { q, sort, order, limit, offset, seqCursor, channelId } = input;

  const actor = actorFrom(ctx);
  const readFilter = resolveCollectionReadFilter(ctx.var.actor.bindings, 'attachment', organizationId, actor);
  const scopeWhere = buildCollectionReadWhere(readFilter, attachmentsTable, 'attachment', actor);

  if (scopeWhere.kind === 'none') {
    return { items: [], total: 0 };
  }

  // Trusted tenant + organization predicate from guarded context, independent of RLS.
  const filters: SQL[] = [requestScopeWhere(ctx, attachmentsTable, 'attachment')];

  // Restrict to the caller's readable scope unless org-wide (kind 'all').
  if (scopeWhere.kind === 'where') filters.push(scopeWhere.where);

  // A channel narrows the read to the rows homed at or below it, on top of the read scope and never through it;
  // the organization itself covers every row.
  const narrowed = !!channelId && channelId !== organizationId;
  const subtreeWhere = narrowed ? buildSubtreeCoverWhere(attachmentsTable, 'attachment', channelId) : undefined;
  if (subtreeWhere) filters.push(subtreeWhere);

  const read = seqCursor ? tenantReadIncludingDeleted : tenantRead;
  const { items: rawItems, total } = await read(ctx, (readCtx) =>
    findAttachmentsPaginated(readCtx, {
      organizationId,
      filters,
      orgWide: scopeWhere.kind === 'all' && !narrowed,
      q,
      sort,
      order,
      limit,
      offset,
      seqCursor,
    }),
  );

  const items = coalesceAuditUsers(rawItems);
  return { items, total };
}
