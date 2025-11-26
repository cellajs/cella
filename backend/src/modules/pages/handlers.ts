import { OpenAPIHono } from '@hono/zod-openapi';
import { and, count, eq, ilike, inArray, or, SQL } from 'drizzle-orm';
import { db } from '#/db/db';
import { pagesTable } from '#/db/schema/pages';
import { usersTable } from '#/db/schema/users';
import { type Env, getContextMemberships, getContextUser } from '#/lib/context';
import { AppError } from '#/lib/errors';
import pagesRoutes from '#/modules/pages/routes';
import { getValidProductEntity } from '#/permissions/get-product-entity';
import { splitByAllowance } from '#/permissions/split-by-allowance';
import { defaultHook } from '#/utils/default-hook';
import { proxyElectricSync } from '#/utils/electric';
import { getIsoDate } from '#/utils/iso-date';
import { logEvent } from '#/utils/logger';
import { getOrderColumn } from '#/utils/order-column';
import { prepareStringForILikeFilter } from '#/utils/sql';
import { Page } from './schema';

const app = new OpenAPIHono<Env>({ defaultHook });

const pagesRouteHandlers = app
  /**
   * Proxy to electric for syncing to client
   * Hono handlers are executed in registration order,
   * so registered first to avoid route collisions.
   */
  .openapi(pagesRoutes.shapeProxy, async (ctx) => {
    const { table, ...query } = ctx.req.valid('query');

    if (table !== 'pages') {
      throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', meta: { toastMessage: 'Denied: table name mismatch.' } });
    }

    if (!query.where) {
      throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', meta: { toastMessage: 'Denied: no organization ID provided.' } });
    }

    // validate organization?

    return await proxyElectricSync(table, query);
  })
  /**
   * Create Page(s)
   */
  .openapi(pagesRoutes.createPages, async (ctx) => {
    // const user = getContextUser();
    // const organization = getContextOrganization();
    // const limit = organization.restrictions.page;

    const newPages = ctx.req.valid('json');

    // if (restrictions && newPages.length > restrictions) {
    //   throw new AppError({ status: 403, type: 'restrict_by_org', severity: 'warn', entityType: 'page' });
    // }

    // get count of matching pages, and check against restrictions

    const pages = await db.insert(pagesTable).values(newPages).returning();

    logEvent('info', `${pages.length} page(s) created`);

    return ctx.json(pages, 201);
  })
  /**
   * Get Pages
   */
  .openapi(pagesRoutes.getPages, async (ctx) => {
    // const user = getContextUser();
    // const organization = getContextOrganization();

    const {
      q,
      // orgIdOrSlug,
      // pageId,
      sort,
      order,
      limit,
      offset,
      // matchMode,
      // acceptedCutOff,
    } = ctx.req.valid('query');

    const matchMode = 'all';

    const filters: SQL[] = [];
    // const filters = [eq(attachmentsTable.organizationId, organization.id)];

    const trimmedQuery = q?.trim();
    if (trimmedQuery) {
      const searchTerms = trimmedQuery.split(/\s+/).filter(Boolean);

      // maybe if page id, try to grab group?
      // i.e., add to filters

      // matching parents/children/groups?
      // matchingUsers // does this need to be a separate thing?
      // or should i just join

      const queryToken = prepareStringForILikeFilter(trimmedQuery);
      const qFilters =
        matchMode === 'all' || searchTerms.length === 1
          ? [
              ilike(pagesTable.title, queryToken),
              ilike(pagesTable.keywords, queryToken),
              ilike(pagesTable.content, queryToken),
              ilike(usersTable.name, queryToken),
              ilike(usersTable.email, queryToken),
            ]
          : [
              // this seems stricter
              inArray(pagesTable.title, searchTerms),
              inArray(pagesTable.keywords, searchTerms), // hm
              inArray(pagesTable.content, searchTerms),
              inArray(usersTable.name, searchTerms),
              inArray(usersTable.email, searchTerms),
            ];

      filters.push(...qFilters);
    }

    const orderColumn = getOrderColumn(
      {
        order: pagesTable.order,
        status: pagesTable.status,
        createdAt: pagesTable.createdAt,
        createdBy: pagesTable.createdBy,
        modifiedAt: pagesTable.modifiedAt,
      },
      sort,
      pagesTable.status,
      order,
    );

    const pagesQuery = db
      .select(pagesTable._.columns)
      .from(pagesTable)
      .leftJoin(usersTable, eq(usersTable.id, pagesTable.createdBy))
      .where(
        and(
          // eq(pagesTable.organizationId, organizationId),
          or(...filters),
        ),
      );

    const promises: [Promise<Page[]>, Promise<number>] = [
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

    const page = await getValidProductEntity(id, 'page', 'organization', 'read');

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

    // todo: validation layer
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
    const memberships = getContextMemberships();

    const { ids } = ctx.req.valid('json');
    if (!ids.length) throw new AppError({ status: 400, type: 'invalid_request', severity: 'warn', entityType: 'page' });

    const { allowedIds, disallowedIds: rejectedItems } = await splitByAllowance('delete', 'page', ids, memberships);

    if (!allowedIds.length) throw new AppError({ status: 403, type: 'forbidden', severity: 'warn', entityType: 'page' });

    const filter = allowedIds.length === 1 ? eq(pagesTable.id, allowedIds[0]) : inArray(pagesTable.id, allowedIds);

    await db.delete(pagesTable).where(filter);

    logEvent('info', 'Page(s) deleted', ids);

    return ctx.json({ success: true, rejectedItems }, 200);
  });

export default pagesRouteHandlers;
