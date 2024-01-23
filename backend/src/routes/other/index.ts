import { sql } from 'drizzle-orm';

import { env } from 'env';
import jwt from 'jsonwebtoken';
import { db } from '../../db/db';
import { organizationsTable, usersTable } from '../../db/schema';
import { CustomHono } from '../../types/common';
import { customLogger } from '../middlewares/custom-logger';
import { getOrganizationUploadTokenRoute, getPersonalUploadTokenRoute, getPublicCountsRoute } from './schema';

const app = new CustomHono();

// routes
const otherRoutes = app
  .openapi(getPersonalUploadTokenRoute, async (ctx) => {
    const isPublic = ctx.req.query('public');
    const user = ctx.get('user');

    const token = jwt.sign({ sub: user.id, public: isPublic === 'true', imado: !!env.AWS_CLOUDFRONT_KEY_ID }, env.TUS_UPLOAD_API_SECRET);

    customLogger('Personal upload token returned');

    return ctx.json({
      success: true,
      data: token,
    });
  })
  .openapi(getOrganizationUploadTokenRoute, async (ctx) => {
    const isPublic = ctx.req.query('public');
    const user = ctx.get('user');
    const { organizationId } = ctx.req.valid('param');

    const token = jwt.sign(
      {
        sub: `${organizationId}/${user.id}`,
        public: isPublic === 'true',
        imado: !!env.AWS_S3_UPLOAD_ACCESS_KEY_ID,
      },
      env.TUS_UPLOAD_API_SECRET,
    );

    customLogger('Organization upload token returned');

    return ctx.json({
      success: true,
      data: token,
    });
  })
  .openapi(getPublicCountsRoute, async (ctx) => {
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

export default otherRoutes;
