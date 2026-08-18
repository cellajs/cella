import { mockUuid, withFakerSeed } from '#/mocks';

export const mockStxBase = (key = 'stx-base:default') =>
  withFakerSeed(key, () => ({
    mutationId: mockUuid(),
    sourceId: mockUuid(),
    fieldTimestamps: {},
  }));
