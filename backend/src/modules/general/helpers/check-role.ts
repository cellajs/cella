import { z } from 'zod';
import { logEvent } from '../../../middlewares/logger/log-event';
import { inviteJsonSchema } from '../schema';

const roleSchema = z.object({
  role: inviteJsonSchema.shape.role,
});

export const checkRole = (schema: typeof roleSchema, role: string | undefined) => {
  if (role && !schema.shape.role.safeParse(role).success) {
    logEvent('Invalid role', { role }, 'warn');
    return false;
  }
  return true;
};
