import { assumeNoSurfaces, withSurface } from 'shared/testing/surfaces';
import { describe, expect, it } from 'vitest';
import type { TKey } from '~/lib/i18n-locales';
import { arrangePlacements, isPlacementHidden, resolvePlacementList } from '~/lib/placements';

// Fixtures use synthetic labels that are not real translation keys.
const key = (s: string) => s as TKey;

assumeNoSurfaces();

const slot = 'organization.settings' as const;

describe('arrangePlacements', () => {
  const items = [
    { id: 'a', label: key('c:a'), order: 10 },
    { id: 'b', label: key('c:b'), order: 20 },
    { id: 'c', label: key('c:c'), order: 30 },
  ];

  it('lists a slot the app lists in the list order, without the ids the list leaves out, and keeps a hidden one', () => {
    withSurface(slot, ['c', 'a'], () => {
      expect(arrangePlacements(slot, items, { order: [], hidden: ['a'] }).map((i) => i.id)).toEqual(['c', 'a']);
      expect(arrangePlacements(slot, items, { order: ['a'] }).map((i) => i.id)).toEqual(['a', 'c']);
    });
  });

  it('gives the order the bar of the slot resolves, for every placement the bar shows', () => {
    withSurface(slot, ['b', 'c', 'a'], () => {
      const slotConfig = { order: ['c'], hidden: ['b'] };
      const shown = resolvePlacementList(slot, items, { slotConfig }).map((i) => i.id);
      expect(
        arrangePlacements(slot, items, slotConfig)
          .map((i) => i.id)
          .filter((id) => shown.includes(id)),
      ).toEqual(shown);
    });
  });
});

describe('isPlacementHidden', () => {
  const item = { id: 'extra', label: key('c:extra'), order: 50 };

  it("lets a channel's stored config hide any placement but a locked one, and the app's surfaces list hide any it leaves out", () => {
    const slotConfig = { order: [], hidden: ['extra'] };
    expect(isPlacementHidden(slot, item, { slotConfig })).toBe(true);
    expect(isPlacementHidden(slot, { ...item, locked: true }, { slotConfig })).toBe(false);

    withSurface(slot, ['general'], () => {
      expect(isPlacementHidden(slot, item, {})).toBe(true);
      expect(isPlacementHidden(slot, { ...item, locked: true }, {})).toBe(true);
      expect(isPlacementHidden(slot, { id: 'general', label: key('c:general'), order: 10 }, {})).toBe(false);
    });
  });
});

describe('resolvePlacementList', () => {
  const items = [
    { id: 'general', label: key('c:general'), order: 10, locked: true },
    { id: 'danger', label: key('c:danger'), order: 90, requires: 'delete', locked: true },
    { id: 'extra', label: key('c:extra'), order: 50 },
    { id: 'staff-only', label: key('c:staff'), order: 40, visibleTo: ['organization.admin' as const] },
  ];

  it('drops entries whose required grant or visibleTo pair is absent', () => {
    expect(resolvePlacementList(slot, items).map((i) => i.id)).toEqual(['general', 'extra']);
    const full = resolvePlacementList(slot, items, { grants: ['delete'], pairs: ['organization.admin'] });
    expect(full.map((i) => i.id)).toEqual(['general', 'staff-only', 'extra', 'danger']);
  });
});
