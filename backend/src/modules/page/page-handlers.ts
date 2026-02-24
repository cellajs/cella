import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, getColumns, gte, ilike, inArray, or, SQL } from 'drizzle-orm';
import type { PageModel } from '#/db/schema/pages';
import { pagesTable } from '#/db/schema/pages';
import { usersTable } from '#/db/schema/users';
import { setPublicRlsContext } from '#/db/tenant-context';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import pagesRoutes from '#/modules/page/page-routes';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { buildStx, getEntityByTransaction, isTransactionProcessed } from '#/sync';
import { checkFieldConflicts, getChangedTrackedFields, throwIfConflicts } from '#/sync/field-versions';
import { defaultHook } from '#/utils/default-hook';
import { extractKeywords } from '#/utils/extract-keywords';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const pageRouteHandlers = app
  /**
   * Get list of pages
   */
  .openapi(pagesRoutes.getPages, async (ctx) => {
    const { q, sort, order, limit, offset, modifiedAfter } = ctx.req.valid('query');

    return setPublicRlsContext('public', async (tenantDb) => {
      const matchMode = 'all';

      const filters: SQL[] = [];

      // Delta sync filter
      if (modifiedAfter) {
        filters.push(gte(pagesTable.modifiedAt, modifiedAfter));
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
                ilike(usersTable.name, queryToken),
                ilike(usersTable.email, queryToken),
              ]
            : [
                inArray(pagesTable.name, searchTerms),
                inArray(pagesTable.keywords, searchTerms),
                inArray(pagesTable.description, searchTerms),
                inArray(usersTable.name, searchTerms),
                inArray(usersTable.email, searchTerms),
              ];

        filters.push(...qFilters);
      }

      const orderColumn = getOrderColumn(sort, pagesTable.status, order, {
        status: pagesTable.status,
        createdAt: pagesTable.createdAt,
        name: pagesTable.name,
      });

      const pagesQuery = tenantDb
        .select(getColumns(pagesTable))
        .from(pagesTable)
        .leftJoin(usersTable, eq(usersTable.id, pagesTable.createdBy))
        .where(and(or(...filters)));

      const promises: [Promise<PageModel[]>, Promise<number>] = [
        pagesQuery.orderBy(orderColumn).limit(limit).offset(offset),
        tenantDb
          .select({ total: count() })
          .from(pagesQuery.as('pages'))
          .then(([{ total }]) => total),
      ];

      const [items, total] = await Promise.all(promises);

      return ctx.json({ items, total }, 200);
    });
  })
  /**
   * Get single page by ID
   */
  .openapi(pagesRoutes.getPage, async (ctx) => {
    const { id } = ctx.req.valid('param');

    return setPublicRlsContext('public', async (tenantDb) => {
      const [page] = await tenantDb.select().from(pagesTable).where(eq(pagesTable.id, id));
      if (!page) throw new AppError(404, 'not_found', 'warn', { entityType: 'page' });

      ctx.set('entityCacheData', page);

      return ctx.json(page, 200);
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
          return ctx.json({ data: existing, rejectedItemIds: [] }, 200);
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

    const createdPages = await tenantDb.insert(pagesTable).values(pagesToInsert).returning();

    logEvent('info', `${createdPages.length} pages have been created`);

    return ctx.json({ data: createdPages, rejectedItemIds: [] }, 201);
  })
  /**
   * Update a page by id
   */
  .openapi(pagesRoutes.updatePage, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const { entity } = await getValidProductEntity(ctx, id, 'page', 'update');

    const { stx, ...pageData } = ctx.req.valid('json');
    const user = ctx.var.user;

    // Field-level conflict detection
    const trackedFields = ['name', 'content', 'status'] as const;
    const changedFields = getChangedTrackedFields(pageData, trackedFields);
    const { conflicts } = checkFieldConflicts(changedFields, entity.stx, stx.lastReadVersion);
    throwIfConflicts('page', conflicts);

    const tenantDb = ctx.var.db;
    const updatedName = pageData.name ?? entity.name;
    const updatedDescription = pageData.description ?? entity.description;

    const [page] = await tenantDb
      .update(pagesTable)
      .set({
        ...pageData,
        keywords: extractKeywords(updatedName, updatedDescription),
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
        stx: buildStx(stx, entity, changedFields),
      })
      .where(eq(pagesTable.id, id))
      .returning();

    logEvent('info', 'Page updated', { pageId: page.id });

    return ctx.json(page, 200);
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
