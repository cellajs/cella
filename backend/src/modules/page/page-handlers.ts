import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, desc, eq, getTableColumns, gt, gte, ilike, inArray, or, SQL } from 'drizzle-orm';
import { streamSSE } from 'hono/streaming';
import { nanoid as generateNanoid } from 'nanoid';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import { PageModel, pagesTable } from '#/db/schema/pages';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity.ts';
import { AppError } from '#/lib/error';
import { pageCache } from '#/lib/page-cache';
import pagesRoutes from '#/modules/page/page-routes';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { getEntityByTransaction, isTransactionProcessed } from '#/sync';
import { activityBus } from '#/sync/activity-bus';
import {
  buildFieldVersions,
  checkFieldConflicts,
  getChangedTrackedFields,
  throwIfConflicts,
} from '#/sync/field-versions';
import { keepAlive, streamSubscriberManager, writeOffset } from '#/sync/stream';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { dispatchToPublicPageSubscribers, type PublicPageSubscriber, publicPageChannel } from './stream';

// Register ActivityBus listeners for public page stream
// Register ActivityBus listeners for public page stream and cache invalidation
activityBus.on('page.created', (event) => {
  if (event.entityId) pageCache.delete(event.entityId);
  dispatchToPublicPageSubscribers(event);
});
activityBus.on('page.updated', (event) => {
  if (event.entityId) pageCache.delete(event.entityId);
  dispatchToPublicPageSubscribers(event);
});
activityBus.on('page.deleted', (event) => {
  if (event.entityId) pageCache.delete(event.entityId);
  dispatchToPublicPageSubscribers(event);
});

const app = new OpenAPIHono<Env>({ defaultHook });

/**
 * Fetch delete activities for public page catch-up.
 * Only returns page.deleted activities since the cursor.
 */
async function fetchPublicDeleteCatchUp(cursor: string | null, limit = 100) {
  const conditions = [eq(activitiesTable.type, 'page.deleted')];
  if (cursor) {
    conditions.push(gt(activitiesTable.id, cursor));
  }

  const activities = await db
    .select({
      id: activitiesTable.id,
      entityId: activitiesTable.entityId,
      createdAt: activitiesTable.createdAt,
    })
    .from(activitiesTable)
    .where(and(...conditions))
    .orderBy(activitiesTable.id) // Use ascending order for forward cursor pagination
    .limit(limit);

  return activities;
}

/**
 * Get latest page activity ID (for 'now' offset).
 */
async function getLatestPageActivityId(): Promise<string | null> {
  const result = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(eq(activitiesTable.entityType, 'page'))
    .orderBy(desc(activitiesTable.id)) // Order by id for consistency with cursor
    .limit(1);

  return result[0]?.id ?? null;
}

const pageRouteHandlers = app
  /**
   * Public stream for page changes.
   * Two modes:
   * - Poll (no live param): Returns batch of delete activities since offset
   * - SSE (live=sse): Live notifications only (client should poll first, then connect with offset=now)
   */
  .openapi(pagesRoutes.publicStream, async (ctx) => {
    const { offset, live } = ctx.req.valid('query');

    // Resolve cursor from offset parameter
    let cursor: string | null = null;
    if (offset === 'now') {
      cursor = await getLatestPageActivityId();
    } else if (offset) {
      cursor = offset;
    }

    // Non-SSE request: return delete catch-up activities as batch
    if (live !== 'sse') {
      const deleteActivities = await fetchPublicDeleteCatchUp(cursor);
      const lastActivity = deleteActivities.at(-1);

      // Always return a consistent cursor - use lastActivity.id, original cursor, or empty string
      const newCursor = lastActivity?.id ?? cursor ?? '';

      return ctx.json({
        activities: deleteActivities.map((a) => ({
          action: 'delete' as const,
          entityType: 'page' as const,
          entityId: a.entityId!,
          changedKeys: null,
          createdAt: a.createdAt,
        })),
        cursor: newCursor,
      });
    }

    // SSE streaming mode - live only, no catch-up (client polls first)
    return streamSSE(ctx, async (stream) => {
      ctx.header('Content-Encoding', '');

      // Send offset marker immediately (live mode ready)
      await writeOffset(stream, cursor);

      // Register subscriber
      const subscriber: PublicPageSubscriber = {
        id: generateNanoid(),
        channel: publicPageChannel,
        stream,
        cursor,
      };

      streamSubscriberManager.register(subscriber);
      logEvent('info', 'Public page stream subscriber registered', { subscriberId: subscriber.id });

      // Handle disconnect
      stream.onAbort(() => {
        streamSubscriberManager.unregister(subscriber.id);
        logEvent('info', 'Public page stream subscriber disconnected', { subscriberId: subscriber.id });
      });

      // Keep connection alive
      await keepAlive(stream);
    });
  })
  /**
   * Create one or more pages
   */
  .openapi(pagesRoutes.createPages, async (ctx) => {
    const newPages = ctx.req.valid('json');

    // Idempotency check - use first item's tx.id
    const firstTx = newPages[0].tx;
    if (await isTransactionProcessed(firstTx.id)) {
      const ref = await getEntityByTransaction(firstTx.id);
      if (ref) {
        // For batch create, the first page ID is stored - fetch all from that batch
        const existing = await db.select().from(pagesTable).where(eq(pagesTable.id, ref.entityId));
        if (existing.length > 0) {
          return ctx.json({ data: existing, rejectedItems: [] }, 200);
        }
      }
    }

    const user = getContextUser();

    // Prepare pages with tx metadata for CDC
    const pagesToInsert = newPages.map(({ tx, ...pageData }) => ({
      ...pageData,
      id: nanoid(),
      entityType: 'page' as const,
      createdAt: getIsoDate(),
      createdBy: user.id,
      description: '',
      displayOrder: 3,
      keywords: '',
      modifiedAt: null,
      modifiedBy: null,
      // Sync: write transient tx metadata for CDC Worker
      tx: {
        id: tx.id,
        sourceId: tx.sourceId,
        version: 1,
        fieldVersions: {},
      },
    }));

    const createdPages = await db.insert(pagesTable).values(pagesToInsert).returning();

    logEvent('info', `${createdPages.length} pages have been created`);

    // Return with tx on each item (for client-side tracking)
    return ctx.json({ data: createdPages, rejectedItems: [] }, 201);
  })
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
              inArray(pagesTable.keywords, searchTerms), // hm
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

    const pagesQuery = db
      .select(getTableColumns(pagesTable))
      .from(pagesTable)
      .leftJoin(usersTable, eq(usersTable.id, pagesTable.createdBy))
      .where(and(or(...filters)));

    const promises: [Promise<PageModel[]>, Promise<number>] = [
      pagesQuery.orderBy(orderColumn).limit(limit).offset(offset),
      db
        .select({ total: count() })
        .from(pagesQuery.as('pages'))
        .then(([{ total }]) => total),
    ];

    const [items, total] = await Promise.all(promises);

    return ctx.json({ items, total }, 200);
  })
  /**
   * Get page by id.
   * Uses LRU cache for efficient public page access.
   */
  .openapi(pagesRoutes.getPage, async (ctx) => {
    const { id } = ctx.req.valid('param');

    // Check page cache first
    const cached = pageCache.get(id);
    if (cached) {
      ctx.header('X-Cache', 'HIT');
      return ctx.json(cached, 200);
    }

    // Cache miss - fetch from DB
    const page = await resolveEntity('page', id);
    if (!page) throw new AppError(404, 'not_found', 'warn', { entityType: 'page' });

    // Cache the result
    pageCache.set(id, page);
    ctx.header('X-Cache', 'MISS');

    return ctx.json(page, 200);
  })
  /**
   * Update page by id
   */
  .openapi(pagesRoutes.updatePage, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const { entity } = await getValidProductEntity(id, 'page', 'update');

    const { tx, ...pageData } = ctx.req.valid('json');
    const user = getContextUser();

    // Get all tracked fields that are being updated
    const trackedFields = ['name', 'content', 'status'] as const;
    const changedFields = getChangedTrackedFields(pageData, trackedFields);

    // Field-level conflict detection - check ALL changed fields
    const { conflicts } = checkFieldConflicts(changedFields, entity.tx, tx.baseVersion);
    throwIfConflicts('page', conflicts);

    const newVersion = (entity.tx?.version ?? 0) + 1;

    const [page] = await db
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

    await db.delete(pagesTable).where(inArray(pagesTable.id, ids));

    logEvent('info', 'Page(s) deleted', ids);

    return ctx.body(null, 204);
  });

export default pageRouteHandlers;
