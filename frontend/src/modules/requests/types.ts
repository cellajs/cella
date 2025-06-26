import type { z } from 'zod/v4';
import type { zGetRequestsResponse } from '~/openapi-client/zod.gen';

export type Request = z.infer<typeof zGetRequestsResponse>['items'][number];
