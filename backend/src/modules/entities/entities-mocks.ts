import { mockNanoid, withFakerSeed } from '#/mocks';

export const mockCatchupResponse = (key = 'stream:default') =>
  withFakerSeed(key, () => ({
    changes: {
      'org-example-id': { signals: { membership: 1 } },
    },
    cursor: mockNanoid(),
  }));
