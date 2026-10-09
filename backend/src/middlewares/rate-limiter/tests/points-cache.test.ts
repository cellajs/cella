import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache, restoreDebt, syncFromDb, takeDebt, tryFastConsume, windowSecondsLeft } from '#/middlewares/rate-limiter/points-cache';

const HOUR_MS = 60 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;

describe('points-cache', () => {
  beforeEach(() => {
    clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('tryFastConsume', () => {
    it('should allow first request for a new key', () => {
      expect(tryFastConsume('tenant:user1', 1, 1000, HOUR_MS)).toBe('allow');
    });

    it('should send an oversized first request to the DB instead of allowing it blind', () => {
      // A bulk request costing more than the whole budget must not pass just because the key is new
      expect(tryFastConsume('tenant:user1', 5000, 1000, HOUR_MS)).toBe('check-db');
    });

    it('should allow requests well under budget (< 80%)', () => {
      // Budget = 1000, threshold = 800
      for (let i = 0; i < 500; i++) {
        expect(tryFastConsume('tenant:user1', 1, 1000, HOUR_MS)).toBe('allow');
      }
    });

    it('should return check-db when approaching budget threshold', () => {
      for (let i = 0; i < 799; i++) {
        tryFastConsume('tenant:user1', 1, 1000, HOUR_MS);
      }
      // Point 800 should trigger check-db (800 >= 1000 * 0.8)
      expect(tryFastConsume('tenant:user1', 1, 1000, HOUR_MS)).toBe('check-db');
    });

    it('should handle bulk costs correctly', () => {
      // Budget = 100, threshold = 80. Cost = 10 per request.
      for (let i = 0; i < 7; i++) {
        expect(tryFastConsume('tenant:user1', 10, 100, HOUR_MS)).toBe('allow');
      }
      expect(tryFastConsume('tenant:user1', 10, 100, HOUR_MS)).toBe('check-db');
    });

    it('should track keys independently', () => {
      // Fill user1 near threshold
      for (let i = 0; i < 799; i++) {
        tryFastConsume('tenant:user1', 1, 1000, HOUR_MS);
      }
      expect(tryFastConsume('tenant:user1', 1, 1000, HOUR_MS)).toBe('check-db');
      expect(tryFastConsume('tenant:user2', 1, 1000, HOUR_MS)).toBe('allow');
    });

    it('should reset counter when window expires', () => {
      vi.useFakeTimers();

      for (let i = 0; i < 800; i++) {
        tryFastConsume('tenant:user1', 1, 1000, HOUR_MS);
      }
      expect(tryFastConsume('tenant:user1', 1, 1000, HOUR_MS)).toBe('check-db');

      // Advance past the 1-hour window
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);

      expect(tryFastConsume('tenant:user1', 1, 1000, HOUR_MS)).toBe('allow');

      vi.useRealTimers();
    });
  });

  describe('takeDebt / restoreDebt', () => {
    it('should return every fast-path consume as unflushed debt, exactly once', () => {
      for (let i = 0; i < 10; i++) {
        tryFastConsume('tenant:user1', 1, 1000, HOUR_MS);
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
      tryFastConsume('tenant:user1', 5, 1000, HOUR_MS);
      expect(takeDebt('tenant:user1')).toBe(5);

      tryFastConsume('tenant:user1', 3, 1000, HOUR_MS);
      expect(takeDebt('tenant:user1')).toBe(3);
    });

    it('should restore claimed debt after a failed DB write', () => {
      tryFastConsume('tenant:user1', 7, 1000, HOUR_MS);
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
        tryFastConsume('tenant:user1', 1, 1000, HOUR_MS);
      }

      // DB path settled everything: count now includes our debt (and other processes).
      syncFromDb('tenant:user1', 900, HOUR_MS, HOUR_MS);

      expect(takeDebt('tenant:user1')).toBe(0);
      // The local counter now reflects the DB, so the next request is over threshold
      expect(tryFastConsume('tenant:user1', 1, 1000, HOUR_MS)).toBe('check-db');
    });

    it('should never lose local consumes to a DB undercount', () => {
      // Fast-path debt must reach the database before local state syncs from it, or an undercount reopens the fast path
      for (let i = 0; i < 799; i++) {
        tryFastConsume('tenant:user1', 1, 1000, HOUR_MS);
      }
      const debt = takeDebt('tenant:user1');
      expect(debt).toBe(799);

      // The DB trip consumes cost + debt, so the count it reports includes everything.
      syncFromDb('tenant:user1', debt + 1, HOUR_MS, HOUR_MS);

      expect(tryFastConsume('tenant:user1', 1, 1000, HOUR_MS)).toBe('check-db');
    });

    it('should create entry for unknown key', () => {
      syncFromDb('tenant:new', 500, HOUR_MS, HOUR_MS);
      // 500 + 1 = 501 < 800 threshold → allow
      expect(tryFastConsume('tenant:new', 1, 1000, HOUR_MS)).toBe('allow');
    });
  });

  describe('the window shared with the database row', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should give a key with no count the whole hour', () => {
      expect(windowSecondsLeft('tenant:nobody', HOUR_MS)).toBe(60 * 60);
    });

    it('should give a row the time left in the hour the key counts in process', () => {
      tryFastConsume('tenant:user1', 1, 1000, HOUR_MS);
      vi.advanceTimersByTime(50 * 60 * 1000);
      // Later fast consumes leave the hour where the first one started it.
      tryFastConsume('tenant:user1', 1, 1000, HOUR_MS);

      expect(windowSecondsLeft('tenant:user1', HOUR_MS)).toBe(10 * 60);
    });

    it('should give the whole hour again once the in-process hour ended', () => {
      tryFastConsume('tenant:user1', 1, 1000, HOUR_MS);
      vi.advanceTimersByTime(HOUR_MS);

      expect(windowSecondsLeft('tenant:user1', HOUR_MS)).toBe(60 * 60);
    });

    it("should keep a spent count until the row's time is up, past the hour the key started in process", () => {
      tryFastConsume('tenant:user1', 1, 1000, HOUR_MS);
      vi.advanceTimersByTime(50 * 60 * 1000);
      // A row another process opened later has 40 minutes left, and its budget is spent.
      syncFromDb('tenant:user1', 1000, 40 * 60 * 1000, HOUR_MS);
      expect(windowSecondsLeft('tenant:user1', HOUR_MS)).toBe(40 * 60);

      // Past the hour that began with the first fast consume, the row is still live.
      vi.advanceTimersByTime(30 * 60 * 1000);
      expect(tryFastConsume('tenant:user1', 1, 1000, HOUR_MS)).toBe('check-db');

      vi.advanceTimersByTime(10 * 60 * 1000);
      expect(tryFastConsume('tenant:user1', 1, 1000, HOUR_MS)).toBe('allow');
    });

    it('should restart the count when the block on a row ends, before the hour does', () => {
      tryFastConsume('tenant:user1', 1, 1000, HOUR_MS);
      // The budget is spent and the store blocks the key for five minutes.
      syncFromDb('tenant:user1', 1001, 5 * 60 * 1000, HOUR_MS);
      expect(tryFastConsume('tenant:user1', 1, 1000, HOUR_MS)).toBe('check-db');

      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(tryFastConsume('tenant:user1', 1, 1000, HOUR_MS)).toBe('allow');
    });

    it('should leave the key its own hour when the store reports no time left', () => {
      tryFastConsume('tenant:user1', 1, 1000, HOUR_MS);
      vi.advanceTimersByTime(50 * 60 * 1000);
      syncFromDb('tenant:user1', 900, -1, HOUR_MS);

      expect(windowSecondsLeft('tenant:user1', HOUR_MS)).toBe(10 * 60);
    });
  });

  describe('a window shorter than an hour', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should count a key in the window its limiter gives it', () => {
      expect(windowSecondsLeft('reads:user1', FIVE_MINUTES_MS)).toBe(5 * 60);

      for (let i = 0; i < 799; i++) tryFastConsume('reads:user1', 1, 1000, FIVE_MINUTES_MS);
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect(windowSecondsLeft('reads:user1', FIVE_MINUTES_MS)).toBe(60);
      expect(tryFastConsume('reads:user1', 1, 1000, FIVE_MINUTES_MS)).toBe('check-db');

      // The window's end restarts the count, long before an hour is over.
      vi.advanceTimersByTime(60 * 1000);
      expect(tryFastConsume('reads:user1', 1, 1000, FIVE_MINUTES_MS)).toBe('allow');
      expect(takeDebt('reads:user1')).toBe(1);
    });

    it('should give a key synced with no time reported the window of its limiter', () => {
      syncFromDb('reads:new', 900, -1, FIVE_MINUTES_MS);
      vi.advanceTimersByTime(60 * 1000);

      expect(windowSecondsLeft('reads:new', FIVE_MINUTES_MS)).toBe(4 * 60);
    });
  });
});
