/**
 * Tests for mutation onSuccess cache-merge utilities.
 *
 * Enforces:
 * - syncEntityToCache writes to both list and detail cache
 */

import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncEntityToCache } from '../update-success-utils';

// Mock cacheUpdate so we can verify it's called
vi.mock('~/query/basic/cache-mutations', () => ({
  cacheUpdate: vi.fn(),
}));

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

    // Pre-populate detail cache
    queryClient.setQueryData<FakeEntity>(detailKey, {
      id: 'e1',
      name: 'Old',
      description: 'Old Desc',
      stx: { mutationId: 'mut-1', sourceId: 'src-1', fieldTimestamps: { name: '100:0001:aaa' } },
      updatedAt: '2026-01-01',
      updatedBy: 'user-1',
    });

    syncEntityToCache({ entity, listKey, detailKey, queryClient });

    // Detail cache updated
    const detail = queryClient.getQueryData<FakeEntity>(detailKey);
    expect(detail?.name).toBe('Updated');
    expect(detail?.stx?.fieldTimestamps?.name).toBe('200:0001:aaa');

    // List cache cacheUpdate was called
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

    // Detail cache should NOT be created from scratch
    expect(queryClient.getQueryData(detailKey)).toBeUndefined();
    // But list cache update is still called
    expect(cacheUpdate).toHaveBeenCalledWith(listKey, [entity]);
  });
});
