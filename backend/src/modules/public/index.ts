import { sql } from 'drizzle-orm';

import { db } from '../../db/db';
import { organizationsTable, usersTable } from '../../db/schema';
import { CustomHono } from '../../types/common';
import { getPublicCountsRoute } from './routes';

const app = new CustomHono();

// routes
const publicRoutes = app.openapi(getPublicCountsRoute, async (ctx) => {
  const [organizationsResult, usersResult] = await Promise.all([
    db.select({
      total: sql<number>`count(*)`.mapWith(Number),
    }).from(organizationsTable),
    db.select({
      total: sql<number>`count(*)`.mapWith(Number),
    }).from(usersTable),
  ]);

  const organizations = organizationsResult[0].total;
  const users = usersResult[0].total;

  return ctx.json({
    success: true,
    data: {
      organizations,
      users,
    },
  });
});

export default publicRoutes;
