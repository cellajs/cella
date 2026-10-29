import { describe, expect, it } from 'vitest';
import { unprefixedPath } from './move-secret-paths';

// Where each secret of a stack set up under `/<slug>-<mode>/` lands, and which secrets the move leaves where they are.
const cases: Array<[path: string, slug: string, mode: string, moved: string | undefined]> = [
  ['/cella-production/backend', 'cella', 'production', '/backend/'],
  ['/cella-production/backend/', 'cella', 'production', '/backend/'],
  ['/cella-production/engine', 'cella', 'production', '/engine/'],
  ['/cella-production/deploy', 'cella', 'production', '/deploy/'],
  ['/cella-production/handoff/backend', 'cella', 'production', '/handoff/backend/'],
  ['/cella-production/shared/backend/jobs', 'cella', 'production', '/shared/backend/jobs/'],
  ['/cella-production', 'cella', 'production', '/'],
  ['/cella-staging-staging/engine', 'cella-staging', 'staging', '/engine/'],
  // Moved already: the move is idempotent.
  ['/backend', 'cella', 'production', undefined],
  ['/', 'cella', 'production', undefined],
  // Another environment's prefix, or one the prefix only starts.
  ['/cella-staging/backend', 'cella', 'production', undefined],
  ['/cella-production-old/backend', 'cella', 'production', undefined],
  ['/runner', 'cella', 'production', undefined],
];

describe('unprefixedPath', () => {
  it.each(cases)('%s of %s-%s moves to %s', (path, slug, mode, moved) => {
    expect(unprefixedPath(path, slug, mode)).toBe(moved);
  });
});
