import type { GetRequestsResponse } from '~/api.gen';

export type Request = GetRequestsResponse['items'][number];
