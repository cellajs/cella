import { z } from '@hono/zod-openapi';
import { appConfig } from 'shared';
import { validSlugSchema } from '#/schemas';

export const checkSlugBodySchema = z.object({
  slug: validSlugSchema,
  entityType: z.enum(appConfig.contextEntityTypes),
});
