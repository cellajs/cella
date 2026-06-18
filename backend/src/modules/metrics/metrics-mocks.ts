/**
 * Mock generators for metrics schemas.
 * Used for OpenAPI examples.
 */

import { withFakerSeed } from '#/mocks';

export const mockPublicCountsResponse = (key = 'metrics:public-counts') =>
  withFakerSeed(key, () => ({
    user: 150,
    organization: 12,
  }));
