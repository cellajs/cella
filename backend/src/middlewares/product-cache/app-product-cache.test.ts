import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActorContext } from '#/core/context';
import { dispatchMutation } from '#/lib/mutation-bus';
import { productCache } from './app-product-cache';

const KEY = 'attachment:att-1';
const row = (name: string) => ({ id: 'att-1', name });

/** The detail cache answers a read with the row, whether or not the CDC worker is there to drop a changed entry. */
describe('product cache: entries of a row that changed', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['performance'] });
    productCache.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores a read and serves it (positive control)', () => {
    expect(productCache.set(KEY, row('first'), performance.now())).toBe(true);
    expect(productCache.get(KEY)).toEqual(row('first'));
  });

  it('must not cache a read that was in flight when the row was invalidated: it read the row from before the change', () => {
    const readStartedAt = performance.now();
    vi.advanceTimersByTime(5);
    // The CDC message for the change arrives while the read is still on its way; no entry exists yet.
    productCache.invalidateProduct('attachment', 'att-1');
    vi.advanceTimersByTime(5);

    expect(productCache.set(KEY, row('from before the change'), readStartedAt)).toBe(false);
    expect(productCache.get(KEY)).toBeUndefined();

    // A read that starts after the invalidation is cached as always.
    expect(productCache.set(KEY, row('after'), performance.now())).toBe(true);
  });

  it('drops the entry of a row this process writes, and caches no read of it until the write has committed', () => {
    productCache.set(KEY, row('old'), performance.now());

    productCache.holdForWrite('attachment', ['att-1']);

    expect(productCache.get(KEY)).toBeUndefined();
    // A read between the write and its commit still sees the old row.
    vi.advanceTimersByTime(50);
    expect(productCache.set(KEY, row('old, read before the commit'), performance.now())).toBe(false);
    // Once the hold is over a read sees the committed row, with no CDC worker involved.
    vi.advanceTimersByTime(5000);
    expect(productCache.set(KEY, row('new'), performance.now())).toBe(true);
    expect(productCache.get(KEY)).toEqual(row('new'));
  });
});

describe('mutation bus: a product write drops its detail cache entry', () => {
  const ctx = {} as ActorContext;

  beforeEach(() => {
    productCache.clear();
    productCache.set(KEY, row('cached'), performance.now());
  });

  it.each(['attachment.updated', 'attachment.deleted'] as const)('drops the entry on %s', async (event) => {
    await dispatchMutation(ctx, event, { before: [row('cached')] });

    expect(productCache.get(KEY)).toBeUndefined();
    expect(productCache.set(KEY, row('read before the commit'), performance.now())).toBe(false);
  });

  it('leaves the entry alone for a create and for a row that is no product', async () => {
    await dispatchMutation(ctx, 'attachment.created', { after: [row('another')] });
    await dispatchMutation(ctx, 'organization.updated', { before: [{ id: 'att-1' }], after: [{ id: 'att-1' }] });

    expect(productCache.get(KEY)).toEqual(row('cached'));
  });
});
