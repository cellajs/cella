import { describe, expect, it } from 'vitest';
import { storableSlots } from './placements.ts';
import { deepHierarchy } from './testing/deep-fixture.ts';

// A row stores its own slots and those of every channel type below it, never one of a type above it.
describe('storableSlots', () => {
  it.each([
    ['organization', ['organization', 'course', 'courseSection', 'project']],
    ['course', ['course', 'courseSection', 'project']],
    ['courseSection', ['courseSection', 'project']],
    ['project', ['project']],
  ])('a %s row stores the slots of %j', (entityType, types) => {
    expect(storableSlots(entityType, deepHierarchy)).toEqual(types.flatMap((type) => [`${type}.settings`, `${type}.tabs`]));
  });

  it('gives a type that is no channel nothing to store', () => {
    expect(storableSlots('item', deepHierarchy)).toEqual([]);
    expect(storableSlots('user', deepHierarchy)).toEqual([]);
  });
});
