import type { z } from 'zod';
import { logEvent } from '../../../middlewares/logger/log-event';

export const checkRole = (
  schema: z.ZodObject<{
    role: z.ZodEnum<[string, ...string[]]>;
  }>,
  role: string | undefined,
) => {
  if (role && !schema.shape.role.safeParse(role).success) {
    logEvent('Invalid role', { role }, 'warn');
    return false;
  }
  return true;
};
