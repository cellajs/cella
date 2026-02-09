import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, getColumns, gte, ilike, inArray, or, SQL } from 'drizzle-orm';
import type { PageModel } from '#/db/schema/pages';
import { pagesTable } from '#/db/schema/pages';
import { usersTable } from '#/db/schema/users';
import { type Env } from '#/lib/context';
import { AppError } from '#/lib/error';
import { resolveEntity } from '#/lib/resolve-entity';
import pagesRoutes from '#/modules/page/page-routes';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { getEntityByTransaction, isTransactionProcessed } from '#/sync';
import {
  buildFieldVersions,
  checkFieldConflicts,
  getChangedTrackedFields,
  throwIfConflicts,
} from '#/sync/field-versions';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * Page route handlers (mounted at /)
 */
const pageRouteHandlers = app
  /**
   * Get Pages
   */
  .openapi(pagesRoutes.getPages, async (ctx) => {
    const { q, sort, order, limit, offset, modifiedAfter } = ctx.req.valid('query');

    const matchMode = 'all';

    const filters: SQL[] = [];

    // Delta sync filter: only return pages modified at or after the given timestamp
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
              // this seems stricter
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

    // Use tenant-scoped db from publicGuard middleware (RLS context already set)
    const tenantDb = ctx.var.db;
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
  })
  /**
   * Get page by id.
   * Cache middleware (xCache) handles HIT. On MISS, handler fetches and sets entityCacheData.
   */
  .openapi(pagesRoutes.getPage, async (ctx) => {
    const { id } = ctx.req.valid('param');

    // Use tenant-scoped db from publicGuard middleware (RLS context already set)
    const tenantDb = ctx.var.db;
    const page = await resolveEntity('page', id, tenantDb);
    if (!page) throw new AppError(404, 'not_found', 'warn', { entityType: 'page' });

    // Set data for cache middleware to store
    ctx.set('entityCacheData', page);

    return ctx.json(page, 200);
  })
  /**
   * Create one or more pages
   */
  .openapi(pagesRoutes.createPages, async (ctx) => {
    const newPages = ctx.req.valid('json');
    const tenantDb = ctx.var.db;

    // Idempotency check - use first item's tx.id
    const firstTx = newPages[0].tx;
    if (await isTransactionProcessed(firstTx.id, tenantDb)) {
      const ref = await getEntityByTransaction(firstTx.id, tenantDb);
      if (ref) {
        // For batch create, the first page ID is stored - fetch all from that batch
        const existing = await tenantDb.select().from(pagesTable).where(eq(pagesTable.id, ref.entityId));
        if (existing.length > 0) {
          return ctx.json({ data: existing, rejectedItems: [] }, 200);
        }
      }
    }

    const user = ctx.var.user;
    const tenantId = ctx.var.tenantId;

    // Prepare pages with tx metadata for CDC
    const pagesToInsert = newPages.map(({ tx, ...pageData }) => ({
      ...pageData,
      tenantId,
      id: nanoid(),
      entityType: 'page' as const,
      createdAt: getIsoDate(),
      createdBy: user.id,
      description: '',
      displayOrder: 3,
      keywords: '',
      modifiedAt: null,
      modifiedBy: null,
      publicAccess: true, // Pages are publicly readable by default
      // Sync: write transient tx metadata for CDC Worker
      tx: {
        id: tx.id,
        sourceId: tx.sourceId,
        version: 1,
        fieldVersions: {},
      },
    }));

    // Insert using tenant-scoped db (RLS context already set)
    const createdPages = await tenantDb.insert(pagesTable).values(pagesToInsert).returning();

    logEvent('info', `${createdPages.length} pages have been created`);

    // Return with tx on each item (for client-side tracking)
    return ctx.json({ data: createdPages, rejectedItems: [] }, 201);
  })
  /**
   * Update page by id
   */
  .openapi(pagesRoutes.updatePage, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const { entity } = await getValidProductEntity(ctx, id, 'page', 'update');

    const { tx, ...pageData } = ctx.req.valid('json');
    const user = ctx.var.user;

    // Get all tracked fields that are being updated
    const trackedFields = ['name', 'content', 'status'] as const;
    const changedFields = getChangedTrackedFields(pageData, trackedFields);

    // Field-level conflict detection - check ALL changed fields
    const { conflicts } = checkFieldConflicts(changedFields, entity.tx, tx.baseVersion);
    throwIfConflicts('page', conflicts);

    const newVersion = (entity.tx?.version ?? 0) + 1;

    // Use tenant-scoped db from tenantGuard middleware (RLS context already set)
    const tenantDb = ctx.var.db;
    const [page] = await tenantDb
      .update(pagesTable)
      .set({
        ...pageData,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
        // Sync: write transient tx metadata for CDC Worker + client tracking
        tx: {
          id: tx.id,
          sourceId: tx.sourceId,
          version: newVersion,
          fieldVersions: buildFieldVersions(entity.tx?.fieldVersions, changedFields, newVersion),
        },
      })
      .where(eq(pagesTable.id, id))
      .returning();

    logEvent('info', 'Page updated', { pageId: page.id });

    // Return entity directly (tx embedded for client tracking)
    return ctx.json(page, 200);
  })
  /**
   * Delete pages by ids
   */
  .openapi(pagesRoutes.deletePages, async (ctx) => {
    const { ids } = ctx.req.valid('json');
    if (!ids.length) throw new AppError(400, 'invalid_request', 'warn', { entityType: 'page' });

    // Use tenant-scoped db from tenantGuard middleware (RLS context already set)
    const tenantDb = ctx.var.db;
    await tenantDb.delete(pagesTable).where(inArray(pagesTable.id, ids));

    logEvent('info', 'Page(s) deleted', ids);

    return ctx.body(null, 204);
  });

export default pageRouteHandlers;
