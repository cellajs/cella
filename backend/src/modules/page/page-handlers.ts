import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, getColumns, gt, ilike, inArray, or, SQL } from 'drizzle-orm';
import { nanoid } from 'shared/nanoid';
import { pagesTable } from '#/db/schema/pages';
import { setPublicRlsContext } from '#/db/tenant-context';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import pagesRoutes from '#/modules/page/page-routes';
import {
  auditUserSelect,
  coalesceAuditUsers,
  createdByUser,
  updatedByUser,
  withAuditUser,
  withAuditUsers,
} from '#/modules/user/helpers/audit-user';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { buildStx, getEntityByTransaction, isTransactionProcessed } from '#/sync';
import { filterNoOpFields, resolveFieldConflicts } from '#/sync/field-versions';
import { defaultHook } from '#/utils/default-hook';
import { extractKeywords } from '#/utils/extract-keywords';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const pageRouteHandlers = app
  /**
   * Get list of pages
   */
  .openapi(pagesRoutes.getPages, async (ctx) => {
    const { q, sort, order, limit, offset, afterSeq } = ctx.req.valid('query');

    return setPublicRlsContext('public', async (tenantDb) => {
      const matchMode = 'all';

      const filters: SQL[] = [];

      // Sequence-based delta sync filter
      if (afterSeq !== undefined) {
        filters.push(gt(pagesTable.seq, afterSeq));
      }

      const trimmedQuery = q?.trim();
      if (trimmedQuery) {
        const searchTerms = trimmedQuery.split(/\s+/).filter(Boolean);

        const queryToken = prepareStringForILikeFilter(trimmedQuery);
        const qFilters =
          matchMode === 'all' || searchTerms.length === 1
            ? [
                ilike(pagesTable.name, queryToken),
                ilike(pagesTable.keywords, queryToken),
                ilike(pagesTable.description, queryToken),
                ilike(createdByUser.name, queryToken),
                ilike(createdByUser.email, queryToken),
              ]
            : [
                inArray(pagesTable.name, searchTerms),
                inArray(pagesTable.keywords, searchTerms),
                inArray(pagesTable.description, searchTerms),
                inArray(createdByUser.name, searchTerms),
                inArray(createdByUser.email, searchTerms),
              ];

        filters.push(...qFilters);
      }

      const orderColumn = getOrderColumn(sort, pagesTable.status, order, {
        status: pagesTable.status,
        createdAt: pagesTable.createdAt,
        name: pagesTable.name,
      });

      const { createdBy: _cb, updatedBy: _mb, ...pageCols } = getColumns(pagesTable);

      const pagesQuery = tenantDb
        .select({ ...pageCols, ...auditUserSelect })
        .from(pagesTable)
        .leftJoin(createdByUser, eq(createdByUser.id, pagesTable.createdBy))
        .leftJoin(updatedByUser, eq(updatedByUser.id, pagesTable.updatedBy))
        .where(and(or(...filters)));

      const [items, total] = await Promise.all([
        pagesQuery.orderBy(orderColumn).limit(limit).offset(offset),
        tenantDb
          .select({ total: count() })
          .from(pagesQuery.as('pages'))
          .then(([{ total }]) => total),
      ]);

      return ctx.json({ items: coalesceAuditUsers(items), total }, 200);
    });
  })
  /**
   * Get single page by ID
   */
  .openapi(pagesRoutes.getPage, async (ctx) => {
    const { id } = ctx.req.valid('param');

    return setPublicRlsContext('public', async (tenantDb) => {
      const [pageRecord] = await tenantDb.select().from(pagesTable).where(eq(pagesTable.id, id));
      if (!pageRecord) throw new AppError(404, 'not_found', 'warn', { entityType: 'page' });

      const pageResponse = await withAuditUser(pageRecord, tenantDb);

      ctx.set('entityCacheData', pageResponse);

      return ctx.json(pageResponse, 200);
    });
  })
  /**
   * Create one or more pages
   */
  .openapi(pagesRoutes.createPages, async (ctx) => {
    const newPages = ctx.req.valid('json');
    const tenantDb = ctx.var.db;

    // Idempotency check
    const firstStx = newPages[0].stx;
    if (await isTransactionProcessed(firstStx.mutationId, tenantDb)) {
      const ref = await getEntityByTransaction(firstStx.mutationId, tenantDb);
      if (ref) {
        const existing = await tenantDb.select().from(pagesTable).where(eq(pagesTable.id, ref.entityId));
        if (existing.length > 0) {
          const pageResponses = await withAuditUsers(existing, tenantDb);
          return ctx.json({ data: pageResponses, rejectedItemIds: [] }, 200);
        }
      }
    }

    const user = ctx.var.user;
    const tenantId = ctx.var.tenantId;

    const pagesToInsert = newPages.map(({ stx, ...pageData }) => ({
      ...pageData,
      tenantId,
      id: nanoid(),
      createdAt: getIsoDate(),
      createdBy: user.id,
      // TODO not yet implemented.
      displayOrder: 3,
      keywords: extractKeywords(pageData.name),
      publicAccess: true,
      stx: buildStx(stx),
    }));

    const pageRecords = await tenantDb.insert(pagesTable).values(pagesToInsert).returning();

    logEvent('info', `${pageRecords.length} pages have been created`);

    const pageResponses = await withAuditUsers(pageRecords, tenantDb, user);

    return ctx.json({ data: pageResponses, rejectedItemIds: [] }, 201);
  })
  /**
   * Update a page by id
   */
  .openapi(pagesRoutes.updatePage, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const { entity } = await getValidProductEntity(ctx, id, 'page', 'update');

    const { ops: rawOps, stx } = ctx.req.valid('json');
    const user = ctx.var.user;

    const fields = filterNoOpFields(entity, rawOps);
    const { accepted } = resolveFieldConflicts(fields, stx.fieldTimestamps ?? {}, entity.stx?.fieldTimestamps ?? {});

    const acceptedFields: Record<string, unknown> = {};
    for (const name of accepted) acceptedFields[name] = (fields as Record<string, unknown>)[name];

    const tenantDb = ctx.var.db;
    const updatedName =
      'name' in acceptedFields && typeof acceptedFields.name === 'string' ? acceptedFields.name : entity.name;
    const updatedDescription =
      'description' in acceptedFields && typeof acceptedFields.description === 'string'
        ? (acceptedFields.description as string)
        : entity.description;

    const [updatedPageRecord] = await tenantDb
      .update(pagesTable)
      .set({
        ...acceptedFields,
        keywords: extractKeywords(updatedName, updatedDescription),
        updatedAt: getIsoDate(),
        updatedBy: user.id,
        stx: buildStx(stx, entity, accepted),
      })
      .where(eq(pagesTable.id, id))
      .returning();

    logEvent('info', 'Page updated', { pageId: updatedPageRecord.id });

    const pageResponse = await withAuditUser(updatedPageRecord, tenantDb, user);

    return ctx.json(pageResponse, 200);
  })
  /**
   * Delete pages by ids
   */
  .openapi(pagesRoutes.deletePages, async (ctx) => {
    const { ids } = ctx.req.valid('json');
    if (!ids.length) throw new AppError(400, 'invalid_request', 'warn', { entityType: 'page' });

    const tenantDb = ctx.var.db;
    await tenantDb.delete(pagesTable).where(inArray(pagesTable.id, ids));

    logEvent('info', 'Page(s) deleted', ids);

    return ctx.json({ data: [], rejectedItemIds: [] }, 200);
  });

export default pageRouteHandlers;
