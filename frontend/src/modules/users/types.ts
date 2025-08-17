import type { z } from 'zod';
import type { zGetUserResponse, zUserBaseSchema } from '~/api.gen/zod.gen';

export type User = z.infer<typeof zGetUserResponse>;
export type UserSummary = z.infer<typeof zUserBaseSchema>;
