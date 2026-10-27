import { describe, expect, it } from 'vitest';
import { rootNodeVersion } from './main-job';
import { pinnedNodeImage } from './node-image';

describe('the node images a key meets', () => {
  it('are pinned by digest at the Node the root engines.node names: a Node bump adds them', () => {
    for (const variant of ['bookworm', 'bookworm-slim'] as const) {
      expect(pinnedNodeImage(rootNodeVersion(), variant)).toMatch(/^docker\.io\/library\/node:[\d.]+-bookworm(-slim)?@sha256:[0-9a-f]{64}$/);
    }
  });
});
