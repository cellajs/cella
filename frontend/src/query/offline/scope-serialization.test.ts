/**
 * Test: React Query scope serialization ensures sequential version freshness.
 *
 * Verifies that when multiple mutations share a `scope`, the second mutation's
 * `mutationFn` only executes after the first mutation's full lifecycle (including
 * `onSuccess`) completes. This is critical for per-key updates: the first mutation's
 * `onSuccess` writes the new `stx` to cache, so the second mutation reads a fresh
 * `lastReadVersion`.
 */

import { MutationObserver, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

interface FakeEntity {
  id: string;
  name: string;
  description: string;
  stx: { version: number; fieldVersions: Record<string, number> };
}

describe('scope serialization: sequential version freshness', () => {
  let queryClient: QueryClient;
  const listKey = ['test', 'list'] as const;

  // Tracks the lastReadVersion each mutationFn call sees
  const capturedVersions: number[] = [];

  beforeEach(() => {
    capturedVersions.length = 0;

    queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
      },
    });

    // Seed cache with a fake entity at version 1
    const initialEntity: FakeEntity = {
      id: 'entity-1',
      name: 'Original',
      description: 'Original desc',
      stx: { version: 1, fieldVersions: { name: 1, description: 1 } },
    };
    queryClient.setQueryData(listKey, initialEntity);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('second mutation reads version bumped by first mutation onSuccess', async () => {
    // Simulate two scoped mutations for the same entity, different fields.
    // The mutationFn reads lastReadVersion from cache.
    // The onSuccess writes the server-returned stx (with bumped version) back to cache.

    let serverVersion = 1;

    const mutationOptions = {
      scope: { id: 'test-entity' },
      mutationFn: async ({ key, data }: { key: string; data: string }) => {
        // Read version from cache (like createStxForUpdate does)
        const cached = queryClient.getQueryData<FakeEntity>(listKey);
        const lastReadVersion = cached?.stx?.version ?? 0;
        capturedVersions.push(lastReadVersion);

        // Simulate server bumping version
        serverVersion++;
        return {
          id: 'entity-1',
          [key]: data,
          stx: { version: serverVersion, fieldVersions: { [key]: serverVersion } },
        };
      },
      onSuccess: (result: Record<string, unknown>) => {
        // Write bumped stx back to cache (like page/query.ts onSuccess does)
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

    // Fire both mutations — scope serialization should run them sequentially
    const observer1 = new MutationObserver(queryClient, mutationOptions);
    const observer2 = new MutationObserver(queryClient, mutationOptions);

    const p1 = observer1.mutate({ key: 'name', data: 'New Name' });
    const p2 = observer2.mutate({ key: 'description', data: 'New Desc' });

    await Promise.all([p1, p2]);

    // First mutation should see the initial version (1)
    expect(capturedVersions[0]).toBe(1);

    // Second mutation should see the version bumped by first's onSuccess (2)
    // If scope doesn't gate on onSuccess, this would be 1 (the bug)
    expect(capturedVersions[1]).toBe(2);

    // Cache should have the final version
    const final = queryClient.getQueryData<FakeEntity>(listKey);
    expect(final?.stx?.version).toBe(3);
  });

  it('without scope, mutations run concurrently and see stale versions', async () => {
    // Control test: same scenario but WITHOUT scope — proves concurrent execution
    // reads stale versions. This validates the test itself.

    let serverVersion = 1;

    const mutationOptions = {
      // No scope — mutations run concurrently
      mutationFn: async ({ key, data }: { key: string; data: string }) => {
        const cached = queryClient.getQueryData<FakeEntity>(listKey);
        const lastReadVersion = cached?.stx?.version ?? 0;
        capturedVersions.push(lastReadVersion);

        // Small delay to ensure overlapping execution
        await new Promise((r) => setTimeout(r, 10));

        serverVersion++;
        return {
          id: 'entity-1',
          [key]: data,
          stx: { version: serverVersion, fieldVersions: { [key]: serverVersion } },
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

    // Both should see version 1 (concurrent — neither waited for the other's onSuccess)
    expect(capturedVersions[0]).toBe(1);
    expect(capturedVersions[1]).toBe(1);
  });
});
