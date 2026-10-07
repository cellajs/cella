import type { ReactElement } from 'react';
import { appConfig } from 'shared';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

const mockCheckConnectivity = vi.fn();
// onError dispatches by severity (toaster.error/warning/info), so the mock needs those methods.
const mockToaster = Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() });
const mockSetDownAlert = vi.fn();
const mockNavigate = vi.fn();
const mockTeardownUserState = vi.fn();

vi.mock('~/query/offline/connectivity', () => ({ checkConnectivity: mockCheckConnectivity }));
vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: mockToaster }));
vi.mock('~/modules/common/alerter/alert-store', () => ({
  useAlertStore: { getState: () => ({ setDownAlert: mockSetDownAlert }) },
}));
vi.mock('~/routes/router', () => ({ router: { navigate: mockNavigate } }));
vi.mock('~/utils/teardown-user-state', () => ({ teardownUserState: mockTeardownUserState }));
// A translation is its own key; a test names the keys that exist.
const knownKeys = vi.hoisted(() => new Set<string>());
vi.mock('i18next', () => {
  const t = (key: string) => key;
  const exists = (key: string) => knownKeys.has(key);
  return { default: { t, exists }, t, exists };
});

const { ApiError } = await import('~/lib/api');
const { RetryWait } = await import('~/modules/common/toaster/retry-wait');
const { onError } = await import('~/query/on-error');

describe('onError network error detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should trigger the connectivity probe for the fetch failure of Chrome, Safari and Firefox, in any casing', () => {
    const messages = ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'FAILED TO FETCH'];
    for (const [i, message] of messages.entries()) {
      onError(new TypeError(message));
      expect(mockCheckConnectivity, message).toHaveBeenCalledTimes(i + 1);
    }
  });

  // --- False positive protection ---

  it('should NOT trigger probe for unrelated TypeError', () => {
    onError(new TypeError('Cannot read properties of undefined'));
    expect(mockCheckConnectivity).not.toHaveBeenCalled();
  });

  it('should NOT trigger probe for ApiError (handled separately)', () => {
    const apiError = new ApiError({ name: 'ApiError', message: 'Server error', status: 500 } as any);
    onError(apiError);
    expect(mockCheckConnectivity).not.toHaveBeenCalled();
  });

  it('should NOT trigger probe for generic Error', () => {
    onError(new Error('Something went wrong'));
    expect(mockCheckConnectivity).not.toHaveBeenCalled();
  });
});

// A 401 is a lost session only when the session guards say so; a refused proof (a wrong authenticator code on the
// MFA toggle) keeps the user signed in.
describe('onError 401 handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', new URL('https://app.example/organizations/acme'));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('tears down the session state for a 401 that means the session is gone', () => {
    onError(new ApiError({ name: 'ApiError', status: 401, type: 'session_revoked', path: '/organizations' }));
    expect(mockTeardownUserState).toHaveBeenCalledWith(false);
  });

  it('must not sign the user out over a refused second factor', () => {
    onError(new ApiError({ name: 'ApiError', status: 401, type: 'invalid_token', path: '/me/mfa', severity: 'warn' }));
    expect(mockTeardownUserState).not.toHaveBeenCalled();
    expect(mockToaster.warning).toHaveBeenCalledOnce();
  });
});

// Under its title a toast says what happened; only a failure worth reporting carries its request id.
describe('onError toast', () => {
  const testMode = appConfig.mode;
  const descriptionOf = (toast: Mock) => toast.mock.calls[0][1].description as ReactElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    knownKeys.clear();
    for (const key of ['server_error', 'server_error.text', 'last_admin', 'last_admin.text', 'slug_exists']) knownKeys.add(`error:${key}`);
  });
  afterEach(() => Reflect.set(appConfig, 'mode', testMode));

  it('explains a server error and offers its request id', () => {
    const error = new ApiError({ status: 500, type: 'server_error', severity: 'error', message: 'Internal server error', requestId: 'req-1' });
    onError(error);

    expect(mockToaster.error).toHaveBeenCalledWith('error:server_error', expect.anything());
    expect(descriptionOf(mockToaster.error)?.props).toEqual({ message: 'error:server_error.text', cause: undefined, report: error });
  });

  it('names the cause of a server error in development only', () => {
    const error = new ApiError({ status: 500, type: 'server_error', severity: 'error', message: 'TypeError: boom', requestId: 'req-1' });

    Reflect.set(appConfig, 'mode', 'production');
    onError(error);
    expect(descriptionOf(mockToaster.error)?.props).toMatchObject({ cause: undefined });

    mockToaster.error.mockClear();
    Reflect.set(appConfig, 'mode', 'development');
    onError(error);
    expect(descriptionOf(mockToaster.error)?.props).toMatchObject({ message: 'error:server_error.text', cause: 'TypeError: boom' });

    // A response without a body has no message of its own: the type that stands in for it is not a cause.
    mockToaster.error.mockClear();
    onError(new ApiError({ status: 500, type: 'server_error', severity: 'error' }));
    expect(descriptionOf(mockToaster.error)?.props).toMatchObject({ cause: undefined });
  });

  it('explains a refusal without a request id', () => {
    onError(
      new ApiError({ status: 409, type: 'last_admin', severity: 'warn', message: 'An organization keeps at least one admin', requestId: 'req-2' }),
    );

    expect(mockToaster.warning).toHaveBeenCalledWith('error:last_admin', expect.anything());
    expect(descriptionOf(mockToaster.warning)?.props).toEqual({ message: 'error:last_admin.text', cause: undefined, report: undefined });
  });

  it('shows the title alone when nothing adds to it', () => {
    onError(new ApiError({ status: 409, type: 'slug_exists', severity: 'warn', message: 'error:slug_exists', requestId: 'req-3' }));

    expect(mockToaster.warning).toHaveBeenCalledWith('error:slug_exists', { description: undefined });
  });

  it('raises the maintenance banner for a 502 or 503, with no toast under it', () => {
    for (const status of [502, 503] as const) {
      onError(new ApiError({ status, type: 'service_unavailable', severity: 'error', requestId: 'req-4' }));
    }

    expect(mockSetDownAlert.mock.calls).toEqual([['maintenance'], ['maintenance']]);
    expect(mockToaster.error).not.toHaveBeenCalled();
  });

  it('counts down the wait of a rate-limited request in place of an explanation', () => {
    onError(new ApiError({ status: 429, type: 'too_many_requests', severity: 'warn', meta: { retryAfter: 120 } }));

    expect(descriptionOf(mockToaster.warning)?.type).toBe(RetryWait);
  });
});
