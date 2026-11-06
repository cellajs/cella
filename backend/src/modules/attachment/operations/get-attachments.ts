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
import { accessFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';
import type { PageWindow } from '#/utils/list-page';
import { projectTombstones, seqRangeOf } from '#/utils/seq-range';

type GetAttachmentsInput = z.infer<typeof attachmentListQuerySchema>;

/**
 * A page of the attachments the caller may read in the organization; `channelId` narrows it to one channel's subtree.
 * A range read (`afterSeq`, `untilSeq`) includes deleted rows, as tombstones.
 */
export async function getAttachmentsOp(ctx: OrgContext, input: GetAttachmentsInput, { offset, limit }: PageWindow) {
  const organizationId = ctx.var.organization.id;
  const { q, orderBy, channelId } = input;
  const range = seqRangeOf(input);

  const access = accessFrom(ctx);
  const readFilter = resolveCollectionReadFilter(access, 'attachment', organizationId);
  const scopeWhere = buildCollectionReadWhere(readFilter, attachmentsTable, access);

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
      ...orderBy,
      limit,
      offset,
      range,
    }),
  );

  const items = projectTombstones('attachment', await withActorRefs(ctx, rawItems));
  return { items, total };
}
