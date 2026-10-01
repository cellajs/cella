import { describe, expect, it } from 'vitest';
import { filterWithRejection, takeWithRestriction } from '#/utils/rejection-utils';

const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('rejection utils', () => {
  it('records each rejected id under its reason', () => {
    const filtered = filterWithRejection(items, (item) => item.id !== 'b', 'slug_exists');
    const limited = takeWithRestriction(filtered.items, 1, 'org_limit_reached', filtered.rejectionState);

    expect(limited.items).toEqual([{ id: 'a' }]);
    expect(limited.rejectionState).toEqual({
      rejectedIds: ['b', 'c'],
      rejectionReasons: { slug_exists: ['b'], org_limit_reached: ['c'] },
    });
  });

  // The client reads the reason keys to pick its error, so a reason without ids must not appear.
  it('adds no reason when nothing is rejected for it', () => {
    const filtered = filterWithRejection(items, () => false, 'slug_exists');
    const limited = takeWithRestriction(filtered.items, 1, 'org_limit_reached', filtered.rejectionState);

    expect(limited.items).toEqual([]);
    expect(Object.keys(limited.rejectionState.rejectionReasons)).toEqual(['slug_exists']);
    expect(filterWithRejection(items, () => true, 'slug_exists').rejectionState.rejectionReasons).toEqual({});
  });
});
