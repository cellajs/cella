import { mockNanoid, withFakerSeed } from '#/mocks';

/**
 * Generates a JSON-mode app stream response example.
 */
export const mockStreamResponse = (key = 'stream:default') =>
  withFakerSeed(key, () => ({
    changes: {
      'org-example-id': {
        signals: { membership: 1 },
      },
    },
    cursor: mockNanoid(),
  }));
