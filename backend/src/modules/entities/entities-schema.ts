import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';

export const checkSlugBodySchema = z.object({
  slug: z.string(),
  entityType: z.enum(['user', ...appConfig.contextEntityTypes]),
});
