import type { z } from 'zod';
import type { zGetUserResponse, zUserSummarySchema } from '~/api.gen/zod.gen';

export type User = z.infer<typeof zGetUserResponse>;
export type UserSummary = z.infer<typeof zUserSummarySchema>;
