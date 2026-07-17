import { describe, expect, it } from 'vitest';
import { ApiError } from '~/lib/api';
import { isNetworkError, mutationRetry } from '~/query/offline/network-retry';

describe('isNetworkError', () => {
  it.each([
    ['Failed to fetch', true], // Chrome, Edge
    ['Load failed', true], // Safari
    ['NetworkError when attempting to fetch resource', true], // Firefox
    ['TypeError: Failed to fetch', true],
    ['Timeout has occurred', false],
    ['Something unrelated', false],
  ])('classifies %j as network=%s', (message, expected) => {
    expect(isNetworkError(new TypeError(message))).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(isNetworkError(new Error('FAILED TO FETCH'))).toBe(true);
  });

  it('never treats an ApiError (server responded) as a network error', () => {
    // A server that responded is not offline, even for a 5xx or a message that happens to
    // contain a network-y phrase. These must fail fast so their handlers run.
    expect(isNetworkError(new ApiError({ status: 503 }))).toBe(false);
    expect(isNetworkError(new ApiError({ status: 500, message: 'failed to fetch' }))).toBe(false);
  });

  it('handles non-Error values without throwing', () => {
    expect(isNetworkError('failed to fetch')).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
    expect(isNetworkError(null)).toBe(false);
  });
});

describe('mutationRetry', () => {
  const netErr = new TypeError('Failed to fetch');

  it('retries connectivity failures across the budget (failureCount 0..2)', () => {
    expect(mutationRetry(0, netErr)).toBe(true);
    expect(mutationRetry(1, netErr)).toBe(true);
    expect(mutationRetry(2, netErr)).toBe(true);
  });

  it('gives up once the retry budget is exhausted', () => {
    expect(mutationRetry(3, netErr)).toBe(false);
    expect(mutationRetry(10, netErr)).toBe(false);
  });

  it('never retries server errors — they must fail fast (4xx quarantine / 5xx toast)', () => {
    expect(mutationRetry(0, new ApiError({ status: 409 }))).toBe(false);
    expect(mutationRetry(0, new ApiError({ status: 500 }))).toBe(false);
  });
});
