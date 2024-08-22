import { type SQL, and, eq, ilike, inArray } from 'drizzle-orm';
import { db } from '../../db/db';

import { labelsTable } from '../../db/schema/labels';
import { errorResponse } from '../../lib/errors';
import { getOrderColumn } from '../../lib/order-column';
import { logEvent } from '../../middlewares/logger/log-event';
import { CustomHono } from '../../types/common';
import labelsRoutesConfig from './routes';

const app = new CustomHono();

// Labels endpoints
const labelsRoutes = app
  /*
   * Create label
   */
  .openapi(labelsRoutesConfig.createLabel, async (ctx) => {
    const newLabel = ctx.req.valid('json');

    const [createdLabel] = await db
      .insert(labelsTable)
      .values({ ...newLabel, ...{ lastUsed: new Date(newLabel.lastUsed) } })
      .returning();

    logEvent('Label created', { task: createdLabel.id });

    return ctx.json({ success: true, data: createdLabel }, 200);
  })
  /*
   * Get list of tasks
   */
  .openapi(labelsRoutesConfig.getLabels, async (ctx) => {
    const { q, sort, order, offset, limit, projectId } = ctx.req.valid('query');

    const labelsFilters: SQL[] = [inArray(labelsTable.projectId, projectId.split('_'))];
    if (q) labelsFilters.push(ilike(labelsTable.name, `%${q}%`));

    const labelsQuery = db
      .select()
      .from(labelsTable)
      .where(and(...labelsFilters));

    const orderColumn = getOrderColumn(
      {
        name: labelsTable.name,
      },
      sort,
      labelsTable.name,
      order,
    );

    const labels = await db.select().from(labelsQuery.as('labels')).orderBy(orderColumn).limit(Number(limit)).offset(Number(offset));

    return ctx.json(
      {
        success: true,
        data: {
          items: labels,
          total: labels.length,
        },
      },
      200,
    );
  })
  /*
   * Update labels
   */
  .openapi(labelsRoutesConfig.updateLabel, async (ctx) => {
    const id = ctx.req.param('id');
    if (!id) return errorResponse(ctx, 404, 'not_found', 'warn');
    const { useCount } = ctx.req.valid('json');
    await db
      .update(labelsTable)
      .set({
        useCount,
      })
      .where(eq(labelsTable.id, id));

    return ctx.json({ success: true }, 200);
  })
  /*
   * Delete labels
   */
  .openapi(labelsRoutesConfig.deleteLabels, async (ctx) => {
    const { ids } = ctx.req.valid('query');
    const idsArray = Array.isArray(ids) ? ids : [ids];

    await db.delete(labelsTable).where(inArray(labelsTable.id, idsArray));
    return ctx.json({ success: true }, 200);
  });

export default labelsRoutes;
