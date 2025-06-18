import type { userSummarySchema } from '#/modules/users/schema';
import type { z } from 'zod';
import { zGetUsersByIdOrSlugResponse } from '~/openapi-client/zod.gen';

export type User = z.infer<typeof zGetUsersByIdOrSlugResponse>['data'];
export type UserSummary = z.infer<typeof userSummarySchema>;
