import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbContext } from '#/core/context';
import { resolveListTotal } from './list-total';

// The counter branch delegates to getOrgEntityCount; stub it so the test needs no DB.
const getOrgEntityCount = vi.fn();
vi.mock('#/modules/entities/entities-queries', () => ({
  getOrgEntityCount: (...args: unknown[]) => getOrgEntityCount(...args),
}));

const ctx = { var: { db: {} } } as unknown as DbContext;
const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('resolveListTotal', () => {
  beforeEach(() => {
    getOrgEntityCount.mockReset();
  });

  it('delta reads report the page length and run neither count', async () => {
    const exactCount = vi.fn();
    const result = await resolveListTotal({
      ctx,
      itemsQuery: Promise.resolve(items),
      isDelta: true,
      counterEligible: false,
      channelKey: 'org-1',
      entityType: 'attachment',
      exactCount,
    });

    expect(result).toEqual({ items, total: items.length });
    expect(exactCount).not.toHaveBeenCalled();
    expect(getOrgEntityCount).not.toHaveBeenCalled();
  });

  it('org-wide unfiltered reads use the channel counter, not COUNT(*)', async () => {
    getOrgEntityCount.mockResolvedValue(42);
    const exactCount = vi.fn();

    const result = await resolveListTotal({
      ctx,
      itemsQuery: Promise.resolve(items),
      isDelta: false,
      counterEligible: true,
      channelKey: 'org-1',
      entityType: 'attachment',
      exactCount,
    });

    expect(result).toEqual({ items, total: 42 });
    expect(getOrgEntityCount).toHaveBeenCalledWith(ctx, 'org-1', 'attachment');
    expect(exactCount).not.toHaveBeenCalled();
  });

  it('filtered/scoped reads fall back to the exact COUNT(*)', async () => {
    const exactCount = vi.fn().mockResolvedValue(7);

    const result = await resolveListTotal({
      ctx,
      itemsQuery: Promise.resolve(items),
      isDelta: false,
      counterEligible: false,
      channelKey: 'org-1',
      entityType: 'attachment',
      exactCount,
    });

    expect(result).toEqual({ items, total: 7 });
    expect(exactCount).toHaveBeenCalledOnce();
    expect(getOrgEntityCount).not.toHaveBeenCalled();
  });
});
