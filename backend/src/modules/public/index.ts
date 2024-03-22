import { sql } from 'drizzle-orm';

import { db } from '../../db/db';
import { organizationsTable } from '../../db/schema/organizations';
import { usersTable } from '../../db/schema/users';
import { CustomHono } from '../../types/common';
import { getPublicCountsRouteConfig } from './routes';

const app = new CustomHono();

// Public endpoints
const publicRoutes = app
  /*
   * Get public counts
   */
  .add(getPublicCountsRouteConfig, async (ctx) => {
    const [organizationsResult, usersResult] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*)`.mapWith(Number),
        })
        .from(organizationsTable),
      db
        .select({
          total: sql<number>`count(*)`.mapWith(Number),
        })
        .from(usersTable),
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

export type PublicRoutes = typeof publicRoutes;
