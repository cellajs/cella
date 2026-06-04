import { describe, expect, it } from 'vitest';
import {
  defaultOrder,
  getEdgeOrder,
  getNewItemOrder,
  getOrderBetween,
  getRelativeOrder,
  orderGap,
} from './display-order';

describe('getOrderBetween', () => {
  it('returns defaultOrder when both bounds are undefined', () => {
    expect(getOrderBetween(undefined, undefined)).toBe(defaultOrder);
  });

  it('extends below when only next is given', () => {
    expect(getOrderBetween(undefined, 50)).toBe(50 - orderGap);
  });

  it('extends above when only prev is given', () => {
    expect(getOrderBetween(50, undefined)).toBe(50 + orderGap);
  });

  it('returns midpoint when both bounds are given', () => {
    expect(getOrderBetween(50, 60)).toBe(55);
  });

  it('returns null when the gap is too small to split', () => {
    const x = 1000;
    const y = x + Number.EPSILON; // unsplittable in float64
    expect(getOrderBetween(x, y)).toBeNull();
  });

  it('handles negative bounds', () => {
    expect(getOrderBetween(-20, -10)).toBe(-15);
  });
});

describe('getEdgeOrder', () => {
  it('returns defaultOrder for an empty list', () => {
    expect(getEdgeOrder([], 'top')).toBe(defaultOrder);
    expect(getEdgeOrder([], 'bottom')).toBe(defaultOrder);
  });

  describe('ascending (default)', () => {
    it("'top' returns min - gap", () => {
      expect(getEdgeOrder([10, 20, 30], 'top')).toBe(0);
    });

    it("'bottom' returns max + gap", () => {
      expect(getEdgeOrder([10, 20, 30], 'bottom')).toBe(40);
    });
  });

  describe('descending', () => {
    it("'top' returns max + gap", () => {
      expect(getEdgeOrder([10, 20, 30], 'top', false)).toBe(40);
    });

    it("'bottom' returns min - gap", () => {
      expect(getEdgeOrder([10, 20, 30], 'bottom', false)).toBe(0);
    });
  });
});

describe('getNewItemOrder', () => {
  it('returns defaultOrder for an empty list', () => {
    expect(getNewItemOrder([])).toBe(defaultOrder);
  });

  it('returns max + gap (ascending bottom)', () => {
    expect(getNewItemOrder([10, 20, 30])).toBe(40);
  });
});

describe('getRelativeOrder (ascending)', () => {
  const items = [
    { id: 'a', displayOrder: 10 },
    { id: 'b', displayOrder: 20 },
    { id: 'c', displayOrder: 30 },
  ];

  it("'top' on first item extends past it", () => {
    expect(getRelativeOrder(items, 10, 'x', 'top')).toBe(0);
  });

  it("'bottom' on last item extends past it", () => {
    expect(getRelativeOrder(items, 30, 'x', 'bottom')).toBe(40);
  });

  it("'top' between two items snaps to a clean integer (was midpoint 15)", () => {
    expect(getRelativeOrder(items, 20, 'x', 'top')).toBe(15);
  });

  it("'bottom' between two items snaps to a clean integer (was midpoint 25)", () => {
    expect(getRelativeOrder(items, 20, 'x', 'bottom')).toBe(25);
  });

  it('snaps to a free integer near the midpoint when midpoint is fractional', () => {
    // gap (35, 40), midpoint 37.5 → snap to 37 or 38, both free, prefers Math.round → 38
    const tight = [
      { id: 'a', displayOrder: 35 },
      { id: 'b', displayOrder: 40 },
    ];
    const result = getRelativeOrder(tight, 40, 'x', 'top');
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThan(35);
    expect(result).toBeLessThan(40);
  });

  it('avoids integers already taken by other siblings', () => {
    // gap between 35 and 40 with 37, 38 taken → only 36 or 39 free
    const crowded = [
      { id: 'a', displayOrder: 35 },
      { id: 'b', displayOrder: 37 },
      { id: 'c', displayOrder: 38 },
      { id: 'd', displayOrder: 40 },
    ];
    const result = getRelativeOrder(crowded, 40, 'x', 'top');
    expect([36, 39]).toContain(result);
  });

  it('falls back to float midpoint when all integers in the gap are taken', () => {
    // gap between 10 and 11 has no integer slot → fall back to 10.5
    const adjacent = [
      { id: 'a', displayOrder: 10 },
      { id: 'b', displayOrder: 11 },
    ];
    expect(getRelativeOrder(adjacent, 11, 'x', 'top')).toBe(10.5);
  });

  it('skips the source item when computing neighbors', () => {
    expect(getRelativeOrder(items, 30, 'b', 'bottom')).toBe(40);
  });

  it('falls back to ±gap when target is not found', () => {
    expect(getRelativeOrder(items, 999, 'x', 'top')).toBe(999 - orderGap);
    expect(getRelativeOrder(items, 999, 'x', 'bottom')).toBe(999 + orderGap);
  });

  it('snaps edge extension to integer even when target is fractional', () => {
    // top page has a fractional order from an earlier between-insert.
    // Dropping above it should land on a clean integer, not target - 10.
    const fractionalTop = [
      { id: 'a', displayOrder: 7.5 },
      { id: 'b', displayOrder: 20 },
    ];
    const result = getRelativeOrder(fractionalTop, 7.5, 'x', 'top');
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeLessThan(7.5);
  });

  it('snaps bottom extension to integer when target is fractional', () => {
    const fractionalBottom = [
      { id: 'a', displayOrder: 10 },
      { id: 'b', displayOrder: 32.5 },
    ];
    const result = getRelativeOrder(fractionalBottom, 32.5, 'x', 'bottom');
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeGreaterThan(32.5);
  });
});

describe('getRelativeOrder (descending)', () => {
  const items = [
    { id: 'a', displayOrder: 10 },
    { id: 'b', displayOrder: 20 },
    { id: 'c', displayOrder: 30 },
  ];

  it("'top' on visual top item extends above", () => {
    expect(getRelativeOrder(items, 30, 'x', 'top', false)).toBe(40);
  });

  it("'bottom' on visual bottom item extends below", () => {
    expect(getRelativeOrder(items, 10, 'x', 'bottom', false)).toBe(0);
  });

  it("'top' between two items snaps clean (toward higher order)", () => {
    expect(getRelativeOrder(items, 20, 'x', 'top', false)).toBe(25);
  });

  it("'bottom' between two items snaps clean (toward lower order)", () => {
    expect(getRelativeOrder(items, 20, 'x', 'bottom', false)).toBe(15);
  });
});

describe('getRelativeOrder collision fallback', () => {
  it('falls back to ±gap when neighbors are too close to split', () => {
    const items = [
      { id: 'a', displayOrder: 1000 },
      { id: 'b', displayOrder: 1000 + Number.EPSILON },
    ];
    expect(getRelativeOrder(items, 1000 + Number.EPSILON, 'x', 'top')).toBe(1000 + Number.EPSILON - orderGap);
  });
});
