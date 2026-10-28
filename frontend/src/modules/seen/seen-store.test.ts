import { appConfig, type ProductEntityType } from 'shared';
import { describe, expect, it, vi } from 'vitest';

const answer = vi.hoisted(() => ({ resolve: () => {} }));
vi.mock('sdk', () => ({ markSeen: vi.fn(() => new Promise<void>((resolve) => Object.assign(answer, { resolve }))) }));
vi.mock('~/modules/seen/unseen-delta', () => ({ applyUnseenDelta: vi.fn() }));

const { applyUnseenDelta } = await import('~/modules/seen/unseen-delta');
const { isSeenLocally, seenStore } = await import('~/modules/seen/seen-store');

const tracked: readonly ProductEntityType[] = appConfig.seenTrackedProductTypes;

// The flush cleared its queue before the request answered: an id in flight read as unseen, so a synced row or a second
// sighting counted the badge down again.
describe('a seen flush still in flight', () => {
  it.skipIf(tracked.length === 0)('counts its ids as seen, so the badge counts each one down once', async () => {
    const meta = { tenantId: 'tenant-1', organizationId: 'org-1', channelId: 'org-1', productType: tracked[0], productId: 'product-1' };
    seenStore.getState().markProductSeen(meta);

    const flushed = seenStore.getState().flush();
    expect(isSeenLocally('product-1')).toBe(true);
    seenStore.getState().markProductSeen(meta);

    answer.resolve();
    await flushed;
    expect(isSeenLocally('product-1')).toBe(true);
    expect(applyUnseenDelta).toHaveBeenCalledTimes(1);
  });
});
