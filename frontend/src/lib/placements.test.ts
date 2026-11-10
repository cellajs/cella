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

  it("puts the app's ordered ids first, the rest after them in declared order, and skips an id that names no placement", () => {
    withSurface(slot, { order: ['c', 'ghost', 'b'] }, () => {
      expect(arrangePlacements(slot, items).map((i) => i.id)).toEqual(['c', 'b', 'a']);
    });
  });

  it("drops what the app hides, keeps what the channel hides, and applies the channel's order over the app's", () => {
    withSurface(slot, { order: ['c', 'b'], hidden: ['b'] }, () => {
      expect(arrangePlacements(slot, items, { order: ['a'], hidden: ['a'] }).map((i) => i.id)).toEqual(['a', 'c']);
    });
  });

  it('gives the order the bar of the slot resolves, for every placement the bar shows', () => {
    withSurface(slot, { order: ['b', 'c', 'a'] }, () => {
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

  it("lets a channel's stored config hide any placement but a locked one, and the app's surfaces entry hide any", () => {
    const slotConfig = { order: [], hidden: ['extra'] };
    expect(isPlacementHidden(slot, item, { slotConfig })).toBe(true);
    expect(isPlacementHidden(slot, { ...item, locked: true }, { slotConfig })).toBe(false);

    withSurface(slot, { hidden: ['extra'] }, () => {
      expect(isPlacementHidden(slot, { ...item, locked: true }, {})).toBe(true);
      expect(isPlacementHidden(slot, { id: 'general', label: key('c:general'), order: 10 }, {})).toBe(false);
    });
  });
});

describe('resolvePlacementList', () => {
  const items = [
    { id: 'general', label: key('c:general'), order: 10, locked: true },
    { id: 'danger', label: key('c:danger'), order: 90, requires: 'delete' as const, locked: true },
    { id: 'extra', label: key('c:extra'), order: 50 },
    { id: 'staff-only', label: key('c:staff'), order: 40, visibleTo: ['organization.admin' as const] },
  ];

  it('drops entries whose required grant or visibleTo pair is absent', () => {
    expect(resolvePlacementList(slot, items).map((i) => i.id)).toEqual(['general', 'extra']);
    const full = resolvePlacementList(slot, items, { grants: ['delete'], pairs: ['organization.admin'] });
    expect(full.map((i) => i.id)).toEqual(['general', 'staff-only', 'extra', 'danger']);
  });
});
