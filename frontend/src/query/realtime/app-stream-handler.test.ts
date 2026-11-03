import '~/query/tests/query-client-env';
import type { StreamChange } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the boundaries: the cache operations, the unseen counts, the fetch queue, the tier lookup, the tab's source id and the signed-in user.
const invalidateEntityDetail = vi.fn();
vi.mock('~/query/realtime/cache-ops', () => ({
  invalidateEntityDetail: (...a: unknown[]) => invalidateEntityDetail(...a),
  invalidateEntityListForOrg: vi.fn(),
}));
const applyUnfetchableRemovalUnseen = vi.fn();
vi.mock('~/modules/seen/unseen-sync', () => ({ applyUnfetchableRemovalUnseen: (...a: unknown[]) => applyUnfetchableRemovalUnseen(...a) }));
const enqueueRange = vi.fn();
const invalidateUndelivered = vi.fn();
vi.mock('~/query/realtime/fetch-prioritizer', () => ({
  enqueueRange: (...a: unknown[]) => enqueueRange(...a),
  invalidateUndelivered: (...a: unknown[]) => invalidateUndelivered(...a),
}));
vi.mock('~/query/realtime/sync-priority', () => ({ getSyncTier: () => ({ min: 0, max: 0 }) }));
vi.mock('~/query/basic/entity-query-registry', () => ({ getEntityQueryKeys: () => ({}) }));
vi.mock('~/query/offline/hlc', () => ({ sourceId: 'tab-a' }));
const session = { user: { id: 'user-a' } };
vi.mock('~/modules/user/user-store', () => ({ userStore: { getState: () => session } }));

const { handleStreamChange } = await import('~/query/realtime/app-stream-handler');
const { onChangeEvent } = await import('~/query/realtime/sync-events');

type ChangeRow = StreamChange['rows'][number];

const stx = { mutationId: 'mut-1', sourceId: 'tab-a', fieldTimestamps: {} };

/** A rename of attachment `att-<seq>` by user A from tab A. */
const row = (seq: number, overrides: Partial<ChangeRow> = {}): ChangeRow => ({ subjectId: `att-${seq}`, seq, stx, actorId: 'user-a', ...overrides });

/** A frame of attachment changes in org 1; one rename at sequence position 7 by default. */
const change = (overrides: Partial<StreamChange> = {}): StreamChange => ({
  action: 'update',
  productType: 'attachment',
  organizationId: 'org-1',
  tenantId: null,
  channelId: null,
  rows: [row(7)],
  overflow: null,
  spreadWindow: null,
  propagation: null,
  ...overrides,
});

afterEach(() => vi.clearAllMocks());

describe('the echo of a tab’s own write', () => {
  it('must not treat another user’s write with a copied sourceId as the tab’s own echo', () => {
    // User B read tab A's source id from a row A wrote and sent it on B's own write.
    handleStreamChange(change({ rows: [row(7, { actorId: 'user-b' })] }));
    expect(enqueueRange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ afterSeq: 6, untilSeq: 7 }));

    // A row that names no writer cannot be the tab's either.
    handleStreamChange(change({ rows: [row(7, { actorId: null })] }));
    expect(enqueueRange).toHaveBeenCalledTimes(2);

    // The tab's own write stays an echo: it fetches nothing.
    handleStreamChange(change());
    expect(enqueueRange).toHaveBeenCalledTimes(2);
  });

  it('fetches nothing for a frame of several rows the tab wrote, and only the others of a mixed one', () => {
    handleStreamChange(change({ rows: [row(7), row(9)] }));
    expect(enqueueRange).not.toHaveBeenCalled();

    // Another writer's rows around the tab's own: the range covers those.
    handleStreamChange(change({ rows: [row(10, { actorId: 'user-b' }), row(11), row(12, { actorId: 'user-b' })] }));
    expect(enqueueRange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ afterSeq: 9, untilSeq: 12 }));
  });
});

describe('a hard delete of several rows', () => {
  it('clears the detail, the stored file and the unseen count of every row, not the first alone', () => {
    const announced: string[] = [];
    const stop = onChangeEvent(({ subjectId }) => void announced.push(subjectId));

    handleStreamChange(change({ action: 'delete', rows: [row(0, { subjectId: 'att-a', seq: null }), row(0, { subjectId: 'att-b', seq: null })] }));
    stop();

    expect(invalidateEntityDetail.mock.calls.map(([subjectId]) => subjectId)).toEqual(['att-a', 'att-b']);
    expect(applyUnfetchableRemovalUnseen.mock.calls.map(([, subjectId]) => subjectId)).toEqual(['att-a', 'att-b']);
    // The download service purges a stored file on this announcement.
    expect(announced).toEqual(['att-a', 'att-b']);
  });
});

describe('a frame past the row cap', () => {
  it('fetches the range of a create or update and refetches the lists after a delete, row by row for neither', () => {
    handleStreamChange(change({ rows: [], overflow: { afterSeq: 40, untilSeq: 90 } }));
    expect(enqueueRange).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ afterSeq: 40, untilSeq: 90 }));

    handleStreamChange(change({ action: 'delete', rows: [], overflow: { afterSeq: null, untilSeq: null } }));
    expect(invalidateUndelivered).toHaveBeenCalledExactlyOnceWith('attachment', 'org-1', [null], true);
    expect(invalidateEntityDetail).not.toHaveBeenCalled();
    expect(applyUnfetchableRemovalUnseen).not.toHaveBeenCalled();
  });
});
