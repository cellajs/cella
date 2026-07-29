import { z } from '@hono/zod-openapi';
import { validEmailSchema } from '#/schemas';

export const magicLinkBodySchema = z.object({
  email: validEmailSchema,
});
