import { mockNanoid, withFakerSeed } from '#/mocks';

export const mockCatchupResponse = (key = 'stream:default') =>
  withFakerSeed(key, () => ({
    organizations: {
      'org-example-id': { signals: { 'membership.changed': 1 } },
    },
    cursor: mockNanoid(),
  }));
