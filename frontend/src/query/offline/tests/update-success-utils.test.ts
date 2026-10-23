import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mergeServerResponse, syncEntityToCache } from '~/query/offline/update-success-utils';

vi.mock('~/query/basic/cache-mutations', () => ({ cacheUpdate: vi.fn() }));

import { cacheUpdate } from '~/query/basic/cache-mutations';

interface FakeEntity {
  id: string;
  name: string;
  description: string;
  stx: { mutationId: string; sourceId: string; fieldTimestamps: Record<string, string> };
  updatedAt: string;
  updatedBy: string;
}

describe('syncEntityToCache', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('writes entity to detail cache when detail entry already exists', () => {
    const listKey = ['test', 'list'];
    const detailKey = ['test', 'detail', 'e1'];
    const entity: FakeEntity = {
      id: 'e1',
      name: 'Updated',
      description: 'Desc',
      stx: { mutationId: 'mut-2', sourceId: 'src-1', fieldTimestamps: { name: '200:0001:aaa' } },
      updatedAt: '2026-01-02',
      updatedBy: 'user-1',
    };

    queryClient.setQueryData<FakeEntity>(detailKey, {
      id: 'e1',
      name: 'Old',
      description: 'Old Desc',
      stx: { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: { name: '100:0001:aaa' } },
      updatedAt: '2026-01-01',
      updatedBy: 'user-1',
    });

    syncEntityToCache({ entity, listKey, detailKey, queryClient });

    const detail = queryClient.getQueryData<FakeEntity>(detailKey);
    expect(detail?.name).toBe('Updated');
    expect(detail?.stx?.fieldTimestamps?.name).toBe('200:0001:aaa');

    expect(cacheUpdate).toHaveBeenCalledWith(listKey, [entity]);
  });

  it('does not create detail cache entry if none existed (guard)', () => {
    const listKey = ['test', 'list'];
    const detailKey = ['test', 'detail', 'e1'];
    const entity: FakeEntity = {
      id: 'e1',
      name: 'New',
      description: 'Desc',
      stx: { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: {} },
      updatedAt: '2026-01-01',
      updatedBy: 'user-1',
    };

    syncEntityToCache({ entity, listKey, detailKey, queryClient });

    expect(queryClient.getQueryData(detailKey)).toBeUndefined();
    expect(cacheUpdate).toHaveBeenCalledWith(listKey, [entity]);
  });
});

describe('mergeServerResponse', () => {
  const stx = { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: {} };
  const cached = { id: 'e1', name: 'Typed meanwhile', description: 'old', keywords: 'old', stx, updatedAt: '2026-01-01', updatedBy: 'u1' };
  const serverEntity = { id: 'e1', name: 'Server name', description: 'new', keywords: 'new words', stx, updatedAt: '2026-01-02', updatedBy: 'u2' };

  it('takes the mutated keys and the stamps, and keeps a concurrent edit of another field', () => {
    const merged = mergeServerResponse({ cached, serverEntity, mutatedKeys: ['description'] });
    expect(merged).toEqual({ ...cached, description: 'new', updatedAt: '2026-01-02', updatedBy: 'u2' });
  });

  it('takes the columns the server derived from a mutated key', () => {
    const merged = mergeServerResponse({
      cached,
      serverEntity,
      mutatedKeys: ['description'],
      derivedKeys: { description: ['keywords'], name: ['slug'] },
    });
    expect(merged.keywords).toBe('new words');
    expect(merged.name).toBe('Typed meanwhile');
  });

  it('leaves a skipped key alone, derived or mutated', () => {
    const merged = mergeServerResponse({
      cached,
      serverEntity,
      mutatedKeys: ['description'],
      derivedKeys: { description: ['keywords'] },
      skipKeys: ['keywords'],
    });
    expect(merged.keywords).toBe('old');
  });

  it('returns the server entity when nothing is cached', () => {
    expect(mergeServerResponse({ serverEntity, mutatedKeys: [] })).toBe(serverEntity);
  });
});
