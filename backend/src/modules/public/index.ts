import { sql } from 'drizzle-orm';

import { db } from '../../db/db';
import { organizationsTable, usersTable } from '../../db/schema';
import { CustomHono } from '../../types/common';
import { getPublicCountsRoute } from './routes';

const app = new CustomHono();

// routes
const publicRoutes = app.openapi(getPublicCountsRoute, async (ctx) => {
  const [{ total: organizations }] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(organizationsTable);

  const [{ total: users }] = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(usersTable);

  return ctx.json({
    success: true,
    data: {
      organizations,
      users,
    },
  });
});

export default publicRoutes;
