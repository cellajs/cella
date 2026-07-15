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

  it('pageLength reads report the page length and query no count', async () => {
    const result = await resolveListTotal(Promise.resolve(items), { kind: 'pageLength' });

    expect(result).toEqual({ items, total: items.length });
    expect(getOrgEntityCount).not.toHaveBeenCalled();
  });

  it('counter reads use the channel counter, not COUNT(*)', async () => {
    getOrgEntityCount.mockResolvedValue(42);

    const result = await resolveListTotal(Promise.resolve(items), {
      kind: 'counter',
      ctx,
      channelKey: 'org-1',
      entityType: 'attachment',
    });

    expect(result).toEqual({ items, total: 42 });
    expect(getOrgEntityCount).toHaveBeenCalledWith(ctx, 'org-1', 'attachment');
  });

  it('exact reads run the provided COUNT(*) thunk', async () => {
    const count = vi.fn().mockResolvedValue(7);

    const result = await resolveListTotal(Promise.resolve(items), { kind: 'exact', count });

    expect(result).toEqual({ items, total: 7 });
    expect(count).toHaveBeenCalledOnce();
    expect(getOrgEntityCount).not.toHaveBeenCalled();
  });
});
