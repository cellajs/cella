import type { z } from 'zod/v4';
import type { zGetRequestsResponse } from '~/api.gen/zod.gen';

export type Request = z.infer<typeof zGetRequestsResponse>['items'][number];
