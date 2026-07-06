import type { z } from '@hono/zod-openapi';
import { orderGap } from 'shared/display-order';
import type { AuthContext } from '#/core/context';
import { buildStx, normalizeCreateItem } from '#/core/stx';
import { findPagesByStxEntityId, getMinPageDisplayOrder, insertPages } from '#/modules/page/page-queries';
import type { pageCreateManyStxBodySchema } from '#/modules/page/page-schema';
import { withAuditUsers } from '#/modules/user/helpers/audit-user';
import { extractKeywords } from '#/utils/extract-keywords';
import { checkIdempotency, getEntityByTransaction } from '#/utils/idempotency';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';

type CreatePagesInput = z.infer<typeof pageCreateManyStxBodySchema>;

export async function createPagesOp(ctx: AuthContext, rawInput: CreatePagesInput) {
  // Lens seam: canonicalize old-shape field names before any body access
  const input = rawInput.map((item) => normalizeCreateItem('page', item));
  const user = ctx.var.user;

  const firstStx = input[0].stx;
  const existing = await checkIdempotency(firstStx.mutationId, async () => {
    const ref = await getEntityByTransaction(firstStx.mutationId);
    if (!ref) return [];
    const pages = await findPagesByStxEntityId(ctx, { entityId: ref.subjectId });
    return withAuditUsers(ctx, pages);
  });
  if (existing) return { success: true as const, data: { data: existing, rejectedIds: [] as string[] } };

  // Trust client-supplied displayOrder when present (offline-aware clients
  // compute it locally for optimistic placement). Fall back to "lower than
  // current min" so legacy clients still land at the top of the list.
  const needsServerOrder = input.some((p) => p.displayOrder === undefined);
  const minOrder = needsServerOrder ? await getMinPageDisplayOrder(ctx, { parentId: null }) : null;
  const fallbackBase = minOrder !== null ? minOrder - orderGap * input.length : 1000;

  const pagesToInsert = input.map(({ stx, id, displayOrder, ...pageData }, index) => ({
    ...pageData,
    id,
    createdAt: getIsoDate(),
    createdBy: user.id,
    displayOrder: displayOrder ?? fallbackBase + index * orderGap,
    keywords: extractKeywords(pageData.name),
    stx: buildStx(stx),
  }));

  const pageRecords = await insertPages(ctx, { pages: pagesToInsert });
  logEvent(ctx, 'info', 'Pages created', { count: pageRecords.length });
  const pageResponses = await withAuditUsers(ctx, pageRecords, user);

  return { success: true as const, data: { data: pageResponses, rejectedIds: [] as string[] } };
}
