import { z } from '@hono/zod-openapi';
import { validEmailSchema } from '#/schemas';

export const magicLinkBodySchema = z.object({
  email: validEmailSchema,
  /** Relative path to land on after the link signs the user in. Validated server-side. */
  redirect: z.string().optional(),
});
