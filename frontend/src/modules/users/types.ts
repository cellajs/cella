import type { z } from 'zod/v4';
import { zGetUserResponse, zUserSummarySchema } from '~/openapi-client/zod.gen';

export type User = z.infer<typeof zGetUserResponse>['data'];
export type UserSummary = z.infer<typeof zUserSummarySchema>;
