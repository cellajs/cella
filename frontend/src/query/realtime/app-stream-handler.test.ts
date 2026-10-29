import '~/query/tests/query-client-env';
import type { StreamChange } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the boundaries: the cache patch, the fetch queue, the tier lookup, the tab's source id and the signed-in user.
const patchEntityStxInCache = vi.fn();
vi.mock('~/query/realtime/cache-ops', () => ({ patchEntityStxInCache: (...a: unknown[]) => patchEntityStxInCache(...a) }));
const enqueueRange = vi.fn();
vi.mock('~/query/realtime/fetch-prioritizer', () => ({ enqueueRange: (...a: unknown[]) => enqueueRange(...a) }));
vi.mock('~/query/realtime/sync-priority', () => ({ getSyncTier: () => ({ min: 0, max: 0 }) }));
vi.mock('~/query/basic/entity-query-registry', () => ({ getEntityQueryKeys: () => ({}) }));
vi.mock('~/query/offline/hlc', () => ({ sourceId: 'tab-a' }));
const session = { user: { id: 'user-a' } };
vi.mock('~/modules/user/user-store', () => ({ userStore: { getState: () => session } }));

const { handleStreamChange } = await import('~/query/realtime/app-stream-handler');

/** A rename of one attachment by user A from tab A, at sequence position 7. */
const change = (overrides: Partial<StreamChange> = {}): StreamChange => ({
  action: 'update',
  productType: 'attachment',
  subjectId: 'att-1',
  organizationId: 'org-1',
  tenantId: null,
  path: 'org-1',
  seq: 7,
  channelId: null,
  stx: { mutationId: 'mut-1', sourceId: 'tab-a', fieldTimestamps: {} },
  actorId: 'user-a',
  batchUntilSeq: null,
  count: null,
  spreadWindow: null,
  propagation: null,
  ...overrides,
});

afterEach(() => vi.clearAllMocks());

describe('the echo of a tab’s own write', () => {
  it('must not treat another user’s write with a copied sourceId as the tab’s own echo', () => {
    // User B read tab A's source id from a row A wrote and sent it on B's own write.
    handleStreamChange(change({ actorId: 'user-b' }));
    expect(patchEntityStxInCache).not.toHaveBeenCalled();
    expect(enqueueRange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ afterSeq: 6, untilSeq: 7 }));

    // A frame that names no writer cannot be the tab's either.
    handleStreamChange(change({ actorId: null }));
    expect(patchEntityStxInCache).not.toHaveBeenCalled();
    expect(enqueueRange).toHaveBeenCalledTimes(2);

    // The tab's own write stays an echo: it patches the stx and fetches nothing.
    handleStreamChange(change());
    expect(patchEntityStxInCache).toHaveBeenCalledExactlyOnceWith('attachment', 'att-1', change().stx, 'org-1');
    expect(enqueueRange).toHaveBeenCalledTimes(2);
  });
});
