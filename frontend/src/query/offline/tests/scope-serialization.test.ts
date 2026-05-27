/**
 * Test: React Query scope serialization ensures sequential HLC freshness.
 *
 * Verifies that when multiple mutations share a `scope`, the second mutation's
 * `mutationFn` only executes after the first mutation's full lifecycle (including
 * `onSuccess`) completes. This is critical for per-key updates: the first mutation's
 * `onSuccess` writes the new `stx` to cache, so the second mutation reads fresh
 * HLC timestamps.
 */

import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface FakeEntity {
  id: string;
  name: string;
  description: string;
  stx: { mutationId: string; sourceId: string; fieldTimestamps: Record<string, string> };
}

describe('scope serialization: sequential HLC freshness', () => {
  let queryClient: QueryClient;
  const listKey = ['test', 'list'] as const;

  // Tracks the fieldTimestamps each mutationFn call sees
  const capturedTimestamps: Record<string, string>[] = [];

  beforeEach(() => {
    capturedTimestamps.length = 0;

    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
      },
    });

    // Seed cache with a fake entity
    const initialEntity: FakeEntity = {
      id: 'entity-1',
      name: 'Original',
      description: 'Original desc',
      stx: {
        mutationId: 'init',
        sourceId: 'server',
        fieldTimestamps: { name: '100:0001:aaa', description: '100:0002:aaa' },
      },
    };
    queryClient.setQueryData(listKey, initialEntity);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('second mutation reads timestamps updated by first mutation onSuccess', async () => {
    let counter = 1;

    const mutationOptions = {
      scope: { id: 'test-entity' },
      mutationFn: async ({ key, data }: { key: string; data: string }) => {
        const cached = queryClient.getQueryData<FakeEntity>(listKey);
        capturedTimestamps.push({ ...(cached?.stx?.fieldTimestamps ?? {}) });

        counter++;
        return {
          id: 'entity-1',
          [key]: data,
          stx: {
            mutationId: `mut-${counter}`,
            sourceId: 'server',
            fieldTimestamps: { ...cached?.stx?.fieldTimestamps, [key]: `${200 + counter}:0001:srv` },
          },
        };
      },
      onSuccess: (result: Record<string, unknown>) => {
        const cached = queryClient.getQueryData<FakeEntity>(listKey);
        if (cached) {
          queryClient.setQueryData(listKey, {
            ...cached,
            ...result,
            stx: result.stx,
          });
        }
      },
    };

    const observer1 = new MutationObserver(queryClient, mutationOptions);
    const observer2 = new MutationObserver(queryClient, mutationOptions);

    const p1 = observer1.mutate({ key: 'name', data: 'New Name' });
    const p2 = observer2.mutate({ key: 'description', data: 'New Desc' });

    await Promise.all([p1, p2]);

    // First mutation should see initial timestamps
    expect(capturedTimestamps[0].name).toBe('100:0001:aaa');

    // Second mutation should see updated name timestamp from first's onSuccess
    expect(capturedTimestamps[1].name).toBe('202:0001:srv');

    // Cache should have final timestamps
    const final = queryClient.getQueryData<FakeEntity>(listKey);
    expect(final?.stx?.fieldTimestamps?.name).toBe('202:0001:srv');
    expect(final?.stx?.fieldTimestamps?.description).toBe('203:0001:srv');
  });

  it('without scope, mutations run concurrently and see stale timestamps', async () => {
    let counter = 1;

    const mutationOptions = {
      // No scope — mutations run concurrently
      mutationFn: async ({ key, data }: { key: string; data: string }) => {
        const cached = queryClient.getQueryData<FakeEntity>(listKey);
        capturedTimestamps.push({ ...(cached?.stx?.fieldTimestamps ?? {}) });

        // Small delay to ensure overlapping execution
        await new Promise((r) => setTimeout(r, 10));

        counter++;
        return {
          id: 'entity-1',
          [key]: data,
          stx: {
            mutationId: `mut-${counter}`,
            sourceId: 'server',
            fieldTimestamps: { ...cached?.stx?.fieldTimestamps, [key]: `${200 + counter}:0001:srv` },
          },
        };
      },
      onSuccess: (result: Record<string, unknown>) => {
        const cached = queryClient.getQueryData<FakeEntity>(listKey);
        if (cached) {
          queryClient.setQueryData(listKey, { ...cached, ...result, stx: result.stx });
        }
      },
    };

    const observer1 = new MutationObserver(queryClient, mutationOptions);
    const observer2 = new MutationObserver(queryClient, mutationOptions);

    const p1 = observer1.mutate({ key: 'name', data: 'New Name' });
    const p2 = observer2.mutate({ key: 'description', data: 'New Desc' });
    await Promise.all([p1, p2]);

    // Both should see the same initial timestamps (concurrent — neither waited for the other's onSuccess)
    expect(capturedTimestamps[0].name).toBe('100:0001:aaa');
    expect(capturedTimestamps[1].name).toBe('100:0001:aaa');
  });
});
