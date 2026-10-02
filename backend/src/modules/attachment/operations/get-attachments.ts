import type { z } from '@hono/zod-openapi';
import type { SQL } from 'drizzle-orm';
import type { OrgContext } from '#/core/context';
import { tenantRead, tenantReadIncludingDeleted } from '#/db/tenant-context';
import { requestScopeWhere } from '#/db/utils/request-scope';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { findAttachmentsPaginated } from '#/modules/attachment/attachment-queries';
import type { attachmentListQuerySchema } from '#/modules/attachment/attachment-schema';
import { attachmentHomeColumnKey, resolveAttachmentHomeScope } from '#/modules/attachment/helpers/attachment-placement';
import { coalesceAuditUsers } from '#/modules/user/helpers/audit-user';
import { actorFrom } from '#/permissions/access';
import { resolveCollectionReadFilter } from '#/permissions/collection-scope';
import { buildCollectionReadWhere } from '#/permissions/row-predicates';

type GetAttachmentsInput = z.infer<typeof attachmentListQuerySchema>;

export async function getAttachmentsOp(ctx: OrgContext, input: GetAttachmentsInput) {
  const organizationId = ctx.var.organization.id;
  const { q, sort, order, limit, offset, seqCursor, channelId } = input;

  // Placement seam: the readable scope compiles against the app's home column and, when a home
  // channel is requested, narrows to it; the org-homed default reads org-wide.
  const homeChannelId = await resolveAttachmentHomeScope(ctx, channelId);
  const actor = actorFrom(ctx);
  const readFilter = resolveCollectionReadFilter(
    ctx.var.actor.bindings,
    'attachment',
    organizationId,
    actor,
    homeChannelId ? { homeChannelId } : undefined,
  );
  const scopeWhere = buildCollectionReadWhere(readFilter, attachmentsTable, attachmentsTable[attachmentHomeColumnKey], actor);

  if (scopeWhere.kind === 'none') {
    return { items: [], total: 0 };
  }

  // Trusted tenant + organization predicate from guarded context, independent of RLS.
  const filters: SQL[] = [requestScopeWhere(ctx, attachmentsTable, 'attachment')];

  // Restrict to the caller's readable scope unless org-wide (kind 'all').
  if (scopeWhere.kind === 'where') filters.push(scopeWhere.where);

  const read = seqCursor ? tenantReadIncludingDeleted : tenantRead;
  const { items: rawItems, total } = await read(ctx, (readCtx) =>
    findAttachmentsPaginated(readCtx, { organizationId, filters, orgWide: scopeWhere.kind === 'all', q, sort, order, limit, offset, seqCursor }),
  );

  const items = coalesceAuditUsers(rawItems);
  return { items, total };
}
