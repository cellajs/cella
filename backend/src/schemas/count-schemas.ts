import { z } from '@hono/zod-openapi';
import { recordFromKeys, roles } from 'shared';

export const membershipCountSchema = z.object({
  ...recordFromKeys(roles.all, () => z.number()),
  pending: z.number(),
  total: z.number(),
});
