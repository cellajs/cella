import type { z } from 'zod/v4';
import { zGetRequestsResponse } from '~/openapi-client/zod.gen';

export type Request = z.infer<typeof zGetRequestsResponse>['items'][number];
