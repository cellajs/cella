import { z } from '@hono/zod-openapi';
import { recordFromKeys, roles } from 'shared';

/** Schema for membership counts by role, plus pending and total */
export const membershipCountSchema = z.object({
  ...recordFromKeys(roles.all, () => z.number()),
  pending: z.number(),
  total: z.number(),
});
