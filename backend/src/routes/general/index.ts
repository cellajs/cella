import { sql, eq } from 'drizzle-orm';

import { env } from 'env';
import jwt from 'jsonwebtoken';
import { db } from '../../db/db';
import { organizationsTable, usersTable } from '../../db/schema';
import { CustomHono } from '../../types/common';
import { customLogger } from '../middlewares/custom-logger';
import { checkSlugRoute, getPublicCountsRoute, getUploadTokenRoute } from './schema';

const app = new CustomHono();

// routes
const generalRoutes = app
  .openapi(getUploadTokenRoute, async (ctx) => {
    const isPublic = ctx.req.query('public');
    const user = ctx.get('user');
    // TODO: validate query param organization
    const organizationId = ctx.req.query('organizationId');

    const sub = organizationId ? `${organizationId}/${user.id}` : user.id;

    const token = jwt.sign(
      {
        sub: sub,
        public: isPublic === 'true',
        imado: !!env.AWS_S3_UPLOAD_ACCESS_KEY_ID,
      },
      env.TUS_UPLOAD_API_SECRET,
    );

    customLogger('Upload token returned');

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
  })
  .openapi(checkSlugRoute, async (ctx) => {
    const { slug } = ctx.req.valid('param');

    const [user] = await db.select().from(usersTable).where(eq(usersTable.slug, slug));

    const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, slug));

    customLogger('Slug checked', {
      slug,
      available: !!user || !!organization,
    });

    return ctx.json({
      success: true,
      data: !!user || !!organization,
    });
  });

export default generalRoutes;
