import { z } from '@hono/zod-openapi';
import { appConfig } from 'config';

export const checkSlugBodySchema = z.object({
  slug: z.string(),
  entityType: z.enum(['user', ...appConfig.contextEntityTypes]),
});
