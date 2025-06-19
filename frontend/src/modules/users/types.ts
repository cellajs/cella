import type { z } from 'zod/v4';
import { zGetUsersByIdOrSlugResponse } from '~/openapi-client/zod.gen';
import type { userSummarySchema } from '#/modules/users/schema';

export type User = z.infer<typeof zGetUsersByIdOrSlugResponse>['data'];
export type UserSummary = z.infer<typeof userSummarySchema>;
