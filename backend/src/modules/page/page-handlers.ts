import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, desc, eq, getTableColumns, gt, ilike, inArray, or, SQL } from 'drizzle-orm';
import { streamSSE } from 'hono/streaming';
import { nanoid as generateNanoid } from 'nanoid';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import { PageModel, pagesTable } from '#/db/schema/pages';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity.ts';
import { AppError } from '#/lib/error';
import pagesRoutes from '#/modules/page/page-routes';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { getEntityByTransaction, isTransactionProcessed } from '#/sync';
import { eventBus } from '#/sync/activity-bus';
import { keepAlive, streamSubscriberManager, writeChange, writeOffset } from '#/sync/stream';
import { defaultHook } from '#/utils/default-hook';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { nanoid } from '#/utils/nanoid';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { dispatchToPublicPageSubscribers, type PublicPageSubscriber, publicPageChannel } from './stream';

// Register ActivityBus listeners for public page stream
eventBus.on('page.created', dispatchToPublicPageSubscribers);
eventBus.on('page.updated', dispatchToPublicPageSubscribers);
eventBus.on('page.deleted', dispatchToPublicPageSubscribers);

/**
 * Fetch catch-up activities for public pages stream.
 */
async function fetchPublicPageActivities(cursor: string | null, limit = 100) {
  const conditions = [eq(activitiesTable.entityType, 'page')];

  if (cursor) {
    conditions.push(gt(activitiesTable.id, cursor));
  }

  const activities = await db
    .select()
    .from(activitiesTable)
    .where(and(...conditions))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(limit);

  return activities.map((activity) => ({
    activityId: activity.id,
    action: activity.action as 'create' | 'update' | 'delete',
    entityType: 'page' as const,
    entityId: activity.entityId!,
    changedKeys: activity.changedKeys ?? null,
    createdAt: activity.createdAt,
    tx: null,
    data: null,
  }));
}

/**
 * Get the latest page activity ID for cursor initialization.
 */
async function getLatestPageActivityId(): Promise<string | null> {
  const result = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(eq(activitiesTable.entityType, 'page'))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(1);

  return result[0]?.id ?? null;
}

const app = new OpenAPIHono<Env>({ defaultHook });

const pageRouteHandlers = app
  /**
   * Public stream for page changes
   */
  .openapi(pagesRoutes.publicStream, async (ctx) => {
    const { offset, live } = ctx.req.valid('query');

    // Resolve cursor from offset parameter
    let cursor: string | null = null;
    if (offset === 'now') {
      cursor = await getLatestPageActivityId();
    } else if (offset === '-1') {
      cursor = null;
    } else if (offset) {
      cursor = offset;
    }

    // Non-streaming catch-up request
    if (live !== 'sse') {
      const activities = await fetchPublicPageActivities(cursor);
      const lastActivity = activities.at(-1);

      return ctx.json({
        activities,
        cursor: lastActivity?.activityId ?? cursor,
      });
    }

    // SSE streaming mode
    return streamSSE(ctx, async (stream) => {
      ctx.header('Content-Encoding', '');

      // Send catch-up activities
      const catchUpActivities = await fetchPublicPageActivities(cursor);
      for (const activity of catchUpActivities) {
        await writeChange(stream, activity.activityId, activity);
        cursor = activity.activityId;
      }

      // Send offset marker (catch-up complete)
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
    const { data: newPages, tx } = ctx.req.valid('json');

    // Idempotency check - return existing entities if transaction already processed
    if (await isTransactionProcessed(tx.id)) {
      const ref = await getEntityByTransaction(tx.id);
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
    const pagesToInsert = newPages.map((pageData) => ({
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
    const { q, sort, order, limit, offset } = ctx.req.valid('query');

    const matchMode = 'all';

    const filters: SQL[] = [];

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

    const orderColumn = getOrderColumn(
      {
        status: pagesTable.status,
        createdAt: pagesTable.createdAt,
        name: pagesTable.name,
      },
      sort,
      pagesTable.status,
      order,
    );

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
   * Get page by id
   */
  .openapi(pagesRoutes.getPage, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const page = await resolveEntity('page', id);
    if (!page) throw new AppError(404, 'not_found', 'warn', { entityType: 'page' });

    return ctx.json(page, 200);
  })
  /**
   * Update page by id
   */
  .openapi(pagesRoutes.updatePage, async (ctx) => {
    const { id } = ctx.req.valid('param');

    const { entity } = await getValidProductEntity(id, 'page', 'update');

    const { data: pageData, tx } = ctx.req.valid('json');
    const user = getContextUser();

    // Derive changed field from payload for conflict detection
    const trackedFields = ['name', 'content', 'status'] as const;
    const changedField = trackedFields.find((f) => f in pageData) ?? null;

    // Field-level conflict detection using version comparison
    if (changedField) {
      const fieldLastModified = entity.tx?.fieldVersions?.[changedField] ?? 0;
      if (fieldLastModified > tx.baseVersion) {
        throw new AppError(409, 'field_conflict', 'warn', {
          entityType: 'page',
          meta: {
            field: changedField,
            clientVersion: tx.baseVersion,
            serverVersion: fieldLastModified,
          },
        });
      }
    }

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
          fieldVersions: {
            ...entity.tx?.fieldVersions,
            ...(changedField ? { [changedField]: newVersion } : {}),
          },
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
