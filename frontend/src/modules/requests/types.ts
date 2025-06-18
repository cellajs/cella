import type { z } from 'zod';
import { zGetRequestsResponse } from '~/openapi-client/zod.gen';

export type Request = z.infer<typeof zGetRequestsResponse>['data']['items'][number];
