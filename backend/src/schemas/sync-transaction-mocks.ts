/**
 * Mock generators for sync transaction (stx) schemas.
 * Used for OpenAPI examples on sync transaction schemas.
 */

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

/**
 * Generates a mock StxResponse example.
 * Used for sync transaction responses.
 */
export const mockStxResponse = (key = 'stx-response:default') =>
  withFakerSeed(key, () => ({
    mutationId: mockUuid(),
    droppedFields: [],
  }));
