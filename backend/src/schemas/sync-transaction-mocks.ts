import { mockUuid, withFakerSeed } from '#/mocks';

/**
 * Generates a mock StxBase example.
 * Used for sync transaction metadata in OpenAPI examples.
 */
export const mockStxBase = (key = 'stx-base:default') =>
  withFakerSeed(key, () => ({
    mutationId: mockUuid(),
    sourceId: mockUuid(),
    fieldTimestamps: {},
  }));
