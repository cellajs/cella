import { OpenAPIHono } from '@hono/zod-openapi';
import { baseDb } from '#/db/db';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { getPages } from '#/modules/page/helpers/get-pages';
import {
  deletePagesByIds,
  findPageById,
  findPagesByStxEntityId,
  insertPages,
  updatePage,
} from '#/modules/page/page-queries';
import pagesRoutes from '#/modules/page/page-routes';
import { withAuditUser, withAuditUserLite, withAuditUsers } from '#/modules/user/helpers/audit-user';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { buildStx, checkIdempotency, getEntityByTransaction, resolveUpdateOps } from '#/sync';
import { defaultHook } from '#/utils/default-hook';
import { extractKeywords } from '#/utils/extract-keywords';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * Get list of pages
 */
app.openapi(pagesRoutes.getPages, async (ctx) => {
  const { q, sort, order, limit, offset, seqCursor } = ctx.req.valid('query');

  const { items, total } = await getPages({ q, sort, order, limit, offset, seqCursor });

  return ctx.json({ items, total }, 200);
});

/**
 * Get single page by ID
 */
app.openapi(pagesRoutes.getPage, async (ctx) => {
  const { id } = ctx.req.valid('param');

  const db = baseDb;
  const pageRecord = await findPageById(db, { id });
  if (!pageRecord) throw new AppError(404, 'not_found', 'warn', { entityType: 'page' });

  const pageResponse = await withAuditUser(ctx, pageRecord);

  ctx.set('entityCacheData', pageResponse);

  return ctx.json(pageResponse, 200);
});

/**
 * Create one or more pages
 */
app.openapi(pagesRoutes.createPages, async (ctx) => {
  const user = ctx.var.user;
  const tenantId = ctx.var.tenantId;

  const newPages = ctx.req.valid('json');

  const db = baseDb;

  // Idempotency check
  const firstStx = newPages[0].stx;
  const existing = await checkIdempotency(firstStx.mutationId, async () => {
    const ref = await getEntityByTransaction(firstStx.mutationId);
    if (!ref) return [];
    const pages = await findPagesByStxEntityId(db, { entityId: ref.entityId });
    return withAuditUsers(ctx, pages);
  });
  if (existing) return ctx.json({ data: existing, rejectedIds: [] }, 200);

  const pagesToInsert = newPages.map(({ stx, id, ...pageData }) => ({
    ...pageData,
    tenantId,
    id,
    createdAt: getIsoDate(),
    createdBy: user.id,
    // TODO not yet implemented.
    displayOrder: 3,
    keywords: extractKeywords(pageData.name),
    stx: buildStx(stx),
  }));

  const pageRecords = await insertPages(db, pagesToInsert);

  logEvent(ctx, 'info', 'Pages created', { count: pageRecords.length });

  const pageResponses = await withAuditUsers(ctx, pageRecords, user);

  return ctx.json({ data: pageResponses, rejectedIds: [] }, 201);
});

/**
 * Update a page by id
 */
app.openapi(pagesRoutes.updatePage, async (ctx) => {
  const user = ctx.var.user;

  const { id } = ctx.req.valid('param');
  const { ops, stx } = ctx.req.valid('json');

  const db = baseDb;
  const { entity } = await getValidProductEntity(ctx, id, 'page', 'update');

  const resolved = resolveUpdateOps(entity, ops, stx);

  const { fullResponse } = ctx.req.valid('query');

  if (!resolved.changed) {
    const pageResponse = fullResponse ? await withAuditUser(ctx, entity, user) : withAuditUserLite(entity, user);
    return ctx.json(pageResponse, 200);
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
  const updatedPageRecord = await updatePage(db, { id, values });

  logEvent(ctx, 'info', 'Page updated', { pageId: updatedPageRecord.id });

  const pageResponse = fullResponse
    ? await withAuditUser(ctx, updatedPageRecord, user)
    : withAuditUserLite(updatedPageRecord, user);

  return ctx.json(pageResponse, 200);
});

/**
 * Delete pages by ids
 */
app.openapi(pagesRoutes.deletePages, async (ctx) => {
  const { ids } = ctx.req.valid('json');
  if (!ids.length) throw new AppError(400, 'invalid_request', 'warn', { entityType: 'page' });

  await deletePagesByIds(baseDb, { ids });

  logEvent(ctx, 'info', 'Pages deleted', { ids });

  return ctx.json({ data: [], rejectedIds: [] }, 200);
});

export { pageTag } from '#/modules/page/page-module';
export const pageHandlers = app;
