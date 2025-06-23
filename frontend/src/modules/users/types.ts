import type { z } from 'zod/v4';
import { zGetUserResponse } from '~/openapi-client/zod.gen';
import type { userSummarySchema } from '#/modules/users/schema';

export type User = z.infer<typeof zGetUserResponse>['data'];
export type UserSummary = z.infer<typeof userSummarySchema>;
