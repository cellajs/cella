import { z } from '@hono/zod-openapi';
import { maxLength, validEmailSchema } from '#/schemas';

export const magicLinkBodySchema = z.object({
  email: validEmailSchema,
  /** Relative path to open after the link signs the user in. Validated server-side. */
  redirect: z.string().max(maxLength.url).optional(),
});
