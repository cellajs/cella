import { describe, expect, it, vi } from 'vitest';

// The module's list writer pulls in the app's query client at import; mergeServerResponse reads none of it.
vi.mock('~/query/basic/cache-mutations', () => ({ cacheUpdate: vi.fn() }));

const { mergeServerResponse } = await import('../update-success-utils');

describe('mergeServerResponse', () => {
  const stx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: {} };
  const serverStx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: { description: '200:0001:aaaaa' } };
  const cached = {
    id: 'e1',
    name: 'Typed meanwhile',
    description: 'old',
    keywords: 'old',
    labels: ['mine'],
    stx,
    updatedAt: '2026-01-01',
    updatedBy: 'u1',
  };
  const serverEntity = {
    id: 'e1',
    name: 'Server name',
    description: 'new',
    keywords: 'new words',
    labels: ['server'],
    stx: serverStx,
    updatedAt: '2026-01-02',
    updatedBy: 'u2',
  };

  it('takes from the response only what this mutation changed, the columns the server derived from it and the stamps, so a concurrent edit survives', () => {
    const merged = mergeServerResponse({
      cached,
      serverEntity,
      mutatedKeys: ['description', 'labels'],
      derivedKeys: { description: ['keywords'], name: ['slug'] },
      skipKeys: ['labels'],
    });

    // `name` was edited meanwhile and `labels` is skipped (raak's task skips its array fields): both keep the cached value.
    expect(merged).toEqual({ ...cached, description: 'new', keywords: 'new words', stx: serverStx, updatedAt: '2026-01-02', updatedBy: 'u2' });
  });
});
