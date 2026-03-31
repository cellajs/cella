/**
 * Mock generators for metrics schemas.
 * Used for OpenAPI examples.
 */

import { withFakerSeed } from './utils';

export const mockPublicCountsResponse = (key = 'metrics:public-counts') =>
  withFakerSeed(key, () => ({
    user: 150,
    organization: 12,
  }));
