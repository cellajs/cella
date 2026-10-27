import type { z } from '@hono/zod-openapi';
import type { SQL } from 'drizzle-orm';
import type { OrgContext } from '#/core/context';
import { tenantRead, tenantReadIncludingDeleted } from '#/db/tenant-context';
import { requestScopeWhere } from '#/db/utils/request-scope';
import { buildSubtreeCoverWhere } from '#/db/utils/subtree-cover';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { findAttachmentsPaginated } from '#/modules/attachment/attachment-queries';
import type { attachmentListQuerySchema } from '#/modules/attachment/attachment-schema';
import { actorFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import { seqRangeOf } from '#/utils/seq-range';

type GetAttachmentsInput = z.infer<typeof attachmentListQuerySchema>;

/**
 * A page of the attachments the caller may read in the organization; `channelId` narrows it to one channel's subtree.
 * A range read (`afterSeq`, `untilSeq`) includes deleted rows.
 */
export async function getAttachmentsOp(ctx: OrgContext, input: GetAttachmentsInput) {
  const organizationId = ctx.var.organization.id;
  const { q, sort, order, limit, offset, channelId } = input;
  const range = seqRangeOf(input);

  const actor = actorFrom(ctx);
  const readFilter = resolveCollectionReadFilter(ctx.var.actor.bindings, 'attachment', organizationId, actor);
  const scopeWhere = buildCollectionReadWhere(readFilter, attachmentsTable, 'attachment', actor);

  if (scopeWhere.kind === 'none') {
    return { items: [], total: 0 };
  }

  // Trusted tenant + organization predicate from guarded context, independent of RLS.
  const filters: SQL[] = [requestScopeWhere(ctx, attachmentsTable, 'attachment')];
  if (scopeWhere.kind === 'where') filters.push(scopeWhere.where);

  // A channel narrows the read to the rows homed at or below it, on top of the read scope and never through it;
  // the organization itself covers every row.
  const narrowed = !!channelId && channelId !== organizationId;
  const subtreeWhere = narrowed ? buildSubtreeCoverWhere(attachmentsTable, 'attachment', channelId) : undefined;
  if (subtreeWhere) filters.push(subtreeWhere);

  // A range read returns deleted rows too, so caches drop them.
  const read = range ? tenantReadIncludingDeleted : tenantRead;
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
      range,
    }),
  );

  const items = await withActorRefs(ctx, rawItems);
  return { items, total };
}
