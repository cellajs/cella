import { mockNanoid, withFakerSeed } from '#/mocks';

export const mockStreamResponse = (key = 'stream:default') =>
  withFakerSeed(key, () => ({
    changes: {
      'org-example-id': {
        signals: { membership: 1 },
      },
    },
    cursor: mockNanoid(),
  }));
