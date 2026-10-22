import { describe, expect, it } from 'vitest';
import { ApiError } from '~/lib/api';
import { isNetworkError, mutationRetry } from '~/query/offline/network-retry';

describe('isNetworkError', () => {
  it('counts the offline fetch failure of every browser as a network error, and no server response or other error', () => {
    const offline = ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource', 'FAILED TO FETCH']; // Chrome and Edge, Safari, Firefox, any casing
    for (const message of offline) expect(isNetworkError(new TypeError(message)), message).toBe(true);

    // A server that responded is not offline, even with a network-y message: its handlers must run at once.
    const notOffline = [
      new ApiError({ status: 503 }),
      new ApiError({ status: 500, message: 'failed to fetch' }),
      new TypeError('Timeout has occurred'),
    ];
    for (const error of notOffline) expect(isNetworkError(error), error.message).toBe(false);
    for (const value of ['failed to fetch', undefined, null]) expect(isNetworkError(value)).toBe(false);
  });
});

describe('mutationRetry', () => {
  it('retries a network failure a bounded number of times, and a server error never (4xx quarantine, 5xx toast)', () => {
    const netErr = new TypeError('Failed to fetch');
    expect([0, 1, 2, 3, 10].map((failureCount) => mutationRetry(failureCount, netErr))).toEqual([true, true, true, false, false]);
    expect(mutationRetry(0, new ApiError({ status: 409 }))).toBe(false);
    expect(mutationRetry(0, new ApiError({ status: 500 }))).toBe(false);
  });
});
