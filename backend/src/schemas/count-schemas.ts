import { z } from '@hono/zod-openapi';
import { recordFromKeys, roles } from 'shared';

/** A channel's members per role and in `total`, plus its open invitations as `pending`. */
export const membershipCountSchema = z.object({ ...recordFromKeys(roles.all, () => z.number()), pending: z.number(), total: z.number() });
