import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, restoreDebt, syncFromDb, takeDebt, tryFastConsume } from '#/middlewares/rate-limiter/points-cache';

describe('points-cache', () => {
  beforeEach(() => {
    clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('tryFastConsume', () => {
    it('should allow first request for a new key', () => {
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('allow');
    });

    it('should send an oversized first request to the DB instead of allowing it blind', () => {
      // A single bulk request costing more than the whole budget must not pass just
      // because the key is new.
      expect(tryFastConsume('tenant:user1', 5000, 1000)).toBe('check-db');
    });

    it('should allow requests well under budget (< 80%)', () => {
      // Budget = 1000, threshold = 800
      for (let i = 0; i < 500; i++) {
        expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('allow');
      }
    });

    it('should return check-db when approaching budget threshold', () => {
      // Consume 799 points (under 80% of 1000)
      for (let i = 0; i < 799; i++) {
        tryFastConsume('tenant:user1', 1, 1000);
      }
      // Point 800 should trigger check-db (800 >= 1000 * 0.8)
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('check-db');
    });

    it('should handle bulk costs correctly', () => {
      // Budget = 100, threshold = 80. Cost = 10 per request.
      for (let i = 0; i < 7; i++) {
        expect(tryFastConsume('tenant:user1', 10, 100)).toBe('allow');
      }
      // 70 consumed, next adds 10 → 80 >= 80 threshold → check-db
      expect(tryFastConsume('tenant:user1', 10, 100)).toBe('check-db');
    });

    it('should track keys independently', () => {
      // Fill user1 near threshold
      for (let i = 0; i < 799; i++) {
        tryFastConsume('tenant:user1', 1, 1000);
      }
      // user1 should be near limit
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('check-db');
      // user2 should still be allowed
      expect(tryFastConsume('tenant:user2', 1, 1000)).toBe('allow');
    });

    it('should reset counter when window expires', () => {
      vi.useFakeTimers();

      // Consume up to threshold
      for (let i = 0; i < 800; i++) {
        tryFastConsume('tenant:user1', 1, 1000);
      }
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('check-db');

      // Advance past the 1-hour window
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      // Should start fresh
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('allow');

      vi.useRealTimers();
    });
  });

  describe('takeDebt / restoreDebt', () => {
    it('should return every fast-path consume as unflushed debt, exactly once', () => {
      for (let i = 0; i < 10; i++) {
        tryFastConsume('tenant:user1', 1, 1000);
      }
      // All 10 allowed requests were never written to the DB, so they are debt.
      expect(takeDebt('tenant:user1')).toBe(10);
      // Claimed debt is marked flushed; a second claim has nothing left.
      expect(takeDebt('tenant:user1')).toBe(0);
    });

    it('should return 0 for unknown keys', () => {
      expect(takeDebt('tenant:nobody')).toBe(0);
    });

    it('should accumulate new debt after a claim', () => {
      tryFastConsume('tenant:user1', 5, 1000);
      expect(takeDebt('tenant:user1')).toBe(5);

      tryFastConsume('tenant:user1', 3, 1000);
      expect(takeDebt('tenant:user1')).toBe(3);
    });

    it('should restore claimed debt after a failed DB write', () => {
      tryFastConsume('tenant:user1', 7, 1000);
      const debt = takeDebt('tenant:user1');
      expect(debt).toBe(7);

      // DB write failed: the debt must not be lost.
      restoreDebt('tenant:user1', debt);
      expect(takeDebt('tenant:user1')).toBe(7);
    });
  });

  describe('syncFromDb', () => {
    it('should adopt the authoritative DB count and clear debt', () => {
      for (let i = 0; i < 10; i++) {
        tryFastConsume('tenant:user1', 1, 1000);
      }

      // DB path settled everything: count now includes our debt (and other processes).
      syncFromDb('tenant:user1', 900);

      // Nothing remains to flush because the DB already has it all.
      expect(takeDebt('tenant:user1')).toBe(0);
      // And the local counter now reflects the DB: next request is over threshold.
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('check-db');
    });

    it('should never lose local consumes to a DB undercount', () => {
      // Fast-path debt must reach the database before local state syncs from it.
      // Otherwise an undercounted database trip could reopen the fast path indefinitely.
      for (let i = 0; i < 799; i++) {
        tryFastConsume('tenant:user1', 1, 1000);
      }
      const debt = takeDebt('tenant:user1');
      expect(debt).toBe(799);

      // The DB trip consumes cost + debt, so the count it reports includes everything.
      syncFromDb('tenant:user1', debt + 1);

      // At the threshold, the budget keeps being checked against the DB.
      expect(tryFastConsume('tenant:user1', 1, 1000)).toBe('check-db');
    });

    it('should create entry for unknown key', () => {
      syncFromDb('tenant:new', 500);
      // 500 + 1 = 501 < 800 threshold → allow
      expect(tryFastConsume('tenant:new', 1, 1000)).toBe('allow');
    });
  });
});
