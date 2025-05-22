import type { z } from 'zod';
import type { userBaseSchema, userSchema } from '#/modules/users/schema';

export type User = z.infer<typeof userSchema>;
export type LimitedUser = z.infer<typeof userBaseSchema>;
