import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '#/core/context';
import { dispatchMutation } from '#/lib/mutation-bus';
import { productCacheStore } from './product-cache-store';

const row = (name: string) => ({ id: 'att-1', name });

/** The detail cache answers a read with the row, whether or not the CDC worker is there to drop a changed entry. */
describe('product cache: entries of a row that changed', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance'] });
    productCacheStore.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores a read and serves it (positive control)', () => {
    expect(productCacheStore.set('attachment', row('first'), performance.now())).toBe(true);
    expect(productCacheStore.get('attachment', 'att-1')).toEqual(row('first'));
  });

  it('must not cache a read that was in flight when the row was invalidated: it read the row from before the change', () => {
    const readStartedAt = performance.now();
    vi.advanceTimersByTime(5);
    // The CDC message for the change arrives while the read is still on its way; no entry exists yet.
    productCacheStore.invalidateProduct('attachment', 'att-1');
    vi.advanceTimersByTime(5);

    expect(productCacheStore.set('attachment', row('from before the change'), readStartedAt)).toBe(false);
    expect(productCacheStore.get('attachment', 'att-1')).toBeUndefined();

    // A read that starts after the invalidation is cached as always.
    expect(productCacheStore.set('attachment', row('after'), performance.now())).toBe(true);
  });

  it('drops the entry of a row this process writes, and caches no read of it until the write has committed', () => {
    productCacheStore.set('attachment', row('old'), performance.now());

    productCacheStore.holdForWrite('attachment', ['att-1']);

    expect(productCacheStore.get('attachment', 'att-1')).toBeUndefined();
    // A read between the write and its commit still sees the old row.
    vi.advanceTimersByTime(50);
    expect(productCacheStore.set('attachment', row('old, read before the commit'), performance.now())).toBe(false);
    // Once the hold is over a read sees the committed row, with no CDC worker involved.
    vi.advanceTimersByTime(5000);
    expect(productCacheStore.set('attachment', row('new'), performance.now())).toBe(true);
    expect(productCacheStore.get('attachment', 'att-1')).toEqual(row('new'));
  });
});

describe('mutation bus: a product write drops its detail cache entry', () => {
  const ctx = {} as ActorContext;

  beforeEach(() => {
    productCacheStore.clear();
    productCacheStore.set('attachment', row('cached'), performance.now());
  });

  it.each(['attachment.updated', 'attachment.deleted'] as const)('drops the entry on %s', async (event) => {
    await dispatchMutation(ctx, event, { before: [row('cached')] });

    expect(productCacheStore.get('attachment', 'att-1')).toBeUndefined();
    expect(productCacheStore.set('attachment', row('read before the commit'), performance.now())).toBe(false);
  });

  it('leaves the entry alone for a create and for a row that is no product', async () => {
    await dispatchMutation(ctx, 'attachment.created', { after: [row('another')] });
    await dispatchMutation(ctx, 'organization.updated', { before: [{ id: 'att-1' }], after: [{ id: 'att-1' }] });

    expect(productCacheStore.get('attachment', 'att-1')).toEqual(row('cached'));
  });
});
