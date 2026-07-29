import { describe, expect, it, vi } from 'vitest';
import { resolveListTotal } from './list-total';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('resolveListTotal', () => {
  it('reports page length without invoking a total source', async () => {
    const getTotal = vi.fn();
    const result = await resolveListTotal(Promise.resolve(items), { kind: 'pageLength' });

    expect(result).toEqual({ items, total: items.length });
    expect(getTotal).not.toHaveBeenCalled();
  });

  it.each(['counter', 'exact'] as const)('resolves a %s total', async (kind) => {
    const getTotal = vi.fn().mockResolvedValue(42);
    const result = await resolveListTotal(Promise.resolve(items), { kind, getTotal });

    expect(result).toEqual({ items, total: 42 });
    expect(getTotal).toHaveBeenCalledOnce();
  });

  it('starts the total source before the items query resolves', async () => {
    let releaseItems: ((value: typeof items) => void) | undefined;
    const itemsQuery = new Promise<typeof items>((resolve) => {
      releaseItems = resolve;
    });
    const getTotal = vi.fn().mockResolvedValue(7);

    const resultPromise = resolveListTotal(itemsQuery, { kind: 'exact', getTotal });
    expect(getTotal).toHaveBeenCalledOnce();

    releaseItems?.(items);
    await expect(resultPromise).resolves.toEqual({ items, total: 7 });
  });
});
