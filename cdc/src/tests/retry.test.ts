import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isTransientError, getErrorCode, withRetry } from '../lib/retry';

describe('retry utility', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('isTransientError', () => {
    it('should return true for PostgreSQL transient error codes', () => {
      // Test various PostgreSQL error codes
      expect(isTransientError({ code: '40001' })).toBe(true); // serialization_failure
      expect(isTransientError({ code: '40P01' })).toBe(true); // deadlock_detected
      expect(isTransientError({ code: '53000' })).toBe(true); // insufficient_resources
      expect(isTransientError({ code: '08006' })).toBe(true); // connection_failure
    });

    it('should return false for non-transient error codes', () => {
      expect(isTransientError({ code: '23505' })).toBe(false); // unique_violation
      expect(isTransientError({ code: '42P01' })).toBe(false); // undefined_table
      expect(isTransientError({ code: '22P02' })).toBe(false); // invalid_text_representation
    });

    it('should return true for transient error messages', () => {
      expect(isTransientError(new Error('connection refused'))).toBe(true);
      expect(isTransientError(new Error('Connection reset by peer'))).toBe(true);
      expect(isTransientError(new Error('query timeout exceeded'))).toBe(true);
      expect(isTransientError(new Error('deadlock detected'))).toBe(true);
      expect(isTransientError(new Error('too many clients already'))).toBe(true);
    });

    it('should return false for non-transient error messages', () => {
      expect(isTransientError(new Error('unique constraint violation'))).toBe(false);
      expect(isTransientError(new Error('column does not exist'))).toBe(false);
      expect(isTransientError(new Error('syntax error'))).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(isTransientError(null)).toBe(false);
      expect(isTransientError(undefined)).toBe(false);
    });

    it('should handle non-object values', () => {
      expect(isTransientError('error')).toBe(false);
      expect(isTransientError(123)).toBe(false);
    });
  });

  describe('getErrorCode', () => {
    it('should extract code from error object', () => {
      expect(getErrorCode({ code: '23505' })).toBe('23505');
      expect(getErrorCode({ code: '40001' })).toBe('40001');
    });

    it('should return null for errors without code', () => {
      expect(getErrorCode(new Error('no code'))).toBe(null);
      expect(getErrorCode({})).toBe(null);
    });

    it('should return null for non-object values', () => {
      expect(getErrorCode(null)).toBe(null);
      expect(getErrorCode(undefined)).toBe(null);
      expect(getErrorCode('string')).toBe(null);
      expect(getErrorCode(123)).toBe(null);
    });

    it('should return null for non-string code', () => {
      expect(getErrorCode({ code: 123 })).toBe(null);
      expect(getErrorCode({ code: null })).toBe(null);
    });
  });

  describe('withRetry', () => {
    it('should return success on first try when function succeeds', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn, 'test operation');

      expect(result).toEqual({
        success: true,
        value: 'success',
        attempts: 1,
      });
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on transient error and succeed', async () => {
      const transientError = Object.assign(new Error('deadlock detected'), { code: '40P01' });
      const fn = vi
        .fn()
        .mockRejectedValueOnce(transientError)
        .mockRejectedValueOnce(transientError)
        .mockResolvedValue('success after retries');

      const resultPromise = withRetry(fn, 'test operation');

      // Fast-forward through retry delays
      await vi.advanceTimersByTimeAsync(100); // First retry delay
      await vi.advanceTimersByTimeAsync(200); // Second retry delay

      const result = await resultPromise;

      expect(result).toEqual({
        success: true,
        value: 'success after retries',
        attempts: 3,
      });
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should return failure after max retries on transient error', async () => {
      const transientError = Object.assign(new Error('connection refused'), { code: '08006' });
      const fn = vi.fn().mockRejectedValue(transientError);

      const resultPromise = withRetry(fn, 'test operation');

      // Fast-forward through all retry delays
      await vi.advanceTimersByTimeAsync(100); // First retry
      await vi.advanceTimersByTimeAsync(200); // Second retry

      const result = await resultPromise;

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('connection refused');
        expect(result.attempts).toBe(3);
        expect(result.isTransient).toBe(true);
      }
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-transient error', async () => {
      const nonTransientError = Object.assign(new Error('unique constraint violation'), {
        code: '23505',
      });
      const fn = vi.fn().mockRejectedValue(nonTransientError);

      const result = await withRetry(fn, 'test operation');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('unique constraint violation');
        expect(result.attempts).toBe(3); // Still counts attempts
        expect(result.isTransient).toBe(false);
      }
      // Should only be called once since error is not transient
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should use exponential backoff for delays', async () => {
      const transientError = new Error('connection timeout');
      const fn = vi
        .fn()
        .mockRejectedValueOnce(transientError)
        .mockRejectedValueOnce(transientError)
        .mockResolvedValue('success');

      const resultPromise = withRetry(fn, 'test operation');

      // First call happens immediately
      expect(fn).toHaveBeenCalledTimes(1);

      // After 50ms, still waiting for first retry (delay is 100ms)
      await vi.advanceTimersByTimeAsync(50);
      expect(fn).toHaveBeenCalledTimes(1);

      // After 100ms total, first retry happens
      await vi.advanceTimersByTimeAsync(50);
      expect(fn).toHaveBeenCalledTimes(2);

      // After 150ms more (250ms total), still waiting for second retry (delay is 200ms)
      await vi.advanceTimersByTimeAsync(150);
      expect(fn).toHaveBeenCalledTimes(2);

      // After 200ms total from second attempt, second retry happens
      await vi.advanceTimersByTimeAsync(50);
      expect(fn).toHaveBeenCalledTimes(3);

      const result = await resultPromise;
      expect(result.success).toBe(true);
    });

    it('should handle thrown strings as errors', async () => {
      const fn = vi.fn().mockRejectedValue('string error');

      const result = await withRetry(fn, 'test operation');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('string error');
      }
    });
  });
});
