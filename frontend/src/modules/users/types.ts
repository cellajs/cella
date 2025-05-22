import type { z } from 'zod';
import type { userSchema, userSummarySchema } from '#/modules/users/schema';

export type User = z.infer<typeof userSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
