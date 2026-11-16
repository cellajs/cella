import { appConfig, type ProductEntityType, seenBatchMax } from 'shared';
import { describe, expect, it, vi } from 'vitest';

const answers = vi.hoisted((): (() => void)[] => []);
vi.mock('sdk', () => ({ markSeen: vi.fn(() => new Promise<void>((resolve) => answers.push(resolve))) }));
vi.mock('~/modules/seen/unseen-delta', () => ({ applyUnseenDelta: vi.fn() }));

const { markSeen } = await import('sdk');
const { applyUnseenDelta } = await import('~/modules/seen/unseen-delta');
const { isSeenLocally, seenStore } = await import('~/modules/seen/seen-store');

// After the imports, whose hide listeners need a whole document: a flush reads only whether the tab is hidden.
vi.stubGlobal('document', { visibilityState: 'visible' });

const tracked: readonly ProductEntityType[] = appConfig.seenTrackedProductTypes;
const meta = { tenantId: 'tenant-1', organizationId: 'org-1', channelId: 'org-1', productType: tracked[0], productId: 'product-1' };
const answerAll = () => {
  for (const resolve of answers.splice(0)) resolve();
};

// The flush cleared its queue before the request answered: an id in flight read as unseen, so a synced row or a second
// sighting counted the badge down again.
describe('a seen flush still in flight', () => {
  it.skipIf(tracked.length === 0)('counts its ids as seen, so the badge counts each one down once', async () => {
    seenStore.getState().markProductSeen(meta);

    const flushed = seenStore.getState().flush();
    expect(isSeenLocally('product-1')).toBe(true);
    seenStore.getState().markProductSeen(meta);

    answerAll();
    await flushed;
    expect(isSeenLocally('product-1')).toBe(true);
    expect(applyUnseenDelta).toHaveBeenCalledTimes(1);
  });
});

// The route takes at most `seenBatchMax` ids: a longer batch, as an offline hour of reading gathers, was refused on every
// flush and never sent.
describe('a seen batch over the route limit', () => {
  it.skipIf(tracked.length === 0)('goes out in parts the route accepts', async () => {
    vi.mocked(markSeen).mockClear();
    for (let i = 0; i <= seenBatchMax; i++) seenStore.getState().markProductSeen({ ...meta, productId: `batch-${i}` });

    const flushed = seenStore.getState().flush();
    answerAll();
    await flushed;
    expect(vi.mocked(markSeen).mock.calls.map(([options]) => options.body.productIds.length)).toEqual([seenBatchMax, 1]);
  });
});
