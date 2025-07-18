import type { z } from 'zod';
import type { zGetRequestsResponse } from '~/api.gen/zod.gen';

export type Request = z.infer<typeof zGetRequestsResponse>['items'][number];
