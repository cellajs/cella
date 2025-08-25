import type { z } from 'zod';
import type { zGetUserResponse, zGetUsersResponse, zUserBaseSchema } from '~/api.gen/zod.gen';

export type User = z.infer<typeof zGetUserResponse>;
export type TableUser = z.infer<typeof zGetUsersResponse>['items'][number];
export type UserSummary = z.infer<typeof zUserBaseSchema>;
