import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, getTableColumns, ilike, inArray, or, SQL } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '#/db/db';
import { PageModel, pagesTable } from '#/db/schema/pages';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextUser } from '#/lib/context';
import { resolveEntity } from '#/lib/entity.ts';
import { AppError } from '#/lib/errors';
import pagesRoutes from '#/modules/pages/routes';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { defaultHook } from '#/utils/default-hook';
import { proxyElectricSync } from '#/utils/electric';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';

const app = new OpenAPIHono<Env>({ defaultHook });

const pagesRouteHandlers = app
  /**
   * Proxy to electric for syncing to client
   * Hono handlers are executed in registration order,
   * so registered first to avoid route collisions.
   */
  .openapi(pagesRoutes.shapeProxy, async (ctx) => {
    const { table, ...query } = ctx.req.valid('query');

    // Validate query params
    if (table !== 'pages') throw new AppError({ status: 400, type: 'sync_table_mismatch', severity: 'error' });

    return await proxyElectricSync(table, query);
  })
  /**
   * Create page
   */
  .openapi(pagesRoutes.createPage, async (ctx) => {
    const pageData = ctx.req.valid('json');
    console.log(pageData);

    const user = getContextUser();

    const newPage = {
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
    };

    const [pageRecord] = await db.insert(pagesTable).values(newPage).returning();

    logEvent('info', `A new ${pageRecord.status} page was created`);

    return ctx.json(pageRecord, 201);
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
    if (!page) throw new AppError({ status: 404, type: 'not_found', severity: 'warn', entityType: 'page' });

    return ctx.json(page, 200);
  })
  /**
   * Update page by id
   */
  .openapi(pagesRoutes.updatePage, async (ctx) => {
    const { id } = ctx.req.valid('param');

    await getValidProductEntity(id, 'page', 'organization', 'update');

    const user = getContextUser();
    const pageData = ctx.req.valid('json');

    // TODO: validation layer
    const [page] = await db
      .update(pagesTable)
      .set({
        ...pageData,
        modifiedAt: getIsoDate(),
        modifiedBy: user.id,
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
    if (!ids.length) throw new AppError({ status: 400, type: 'invalid_request', severity: 'warn', entityType: 'page' });

    await db.delete(pagesTable).where(inArray(pagesTable.id, ids));

    logEvent('info', 'Page(s) deleted', ids);

    return ctx.body(null, 204);
  });

export default pagesRouteHandlers;
