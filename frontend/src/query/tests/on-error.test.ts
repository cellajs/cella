import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('i18next', () => {
  const t = (key: string) => key;
  return { default: { t, exists: () => false }, t, exists: () => false };
});

const { ApiError } = await import('~/lib/api');
const { onError } = await import('~/query/on-error');

describe('onError network error detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Network error variants across browsers ---

  it('should trigger connectivity probe for Chrome "Failed to fetch"', () => {
    onError(new TypeError('Failed to fetch'));
    expect(mockCheckConnectivity).toHaveBeenCalledOnce();
  });

  it('should trigger connectivity probe for Safari "Load failed"', () => {
    onError(new TypeError('Load failed'));
    expect(mockCheckConnectivity).toHaveBeenCalledOnce();
  });

  it('should trigger connectivity probe for Firefox "NetworkError"', () => {
    onError(new TypeError('NetworkError when attempting to fetch resource.'));
    expect(mockCheckConnectivity).toHaveBeenCalledOnce();
  });

  it('should trigger connectivity probe case-insensitively', () => {
    onError(new TypeError('FAILED TO FETCH'));
    expect(mockCheckConnectivity).toHaveBeenCalledOnce();
  });

  // --- False positive protection ---

  it('should NOT trigger probe for unrelated TypeError', () => {
    onError(new TypeError('Cannot read properties of undefined'));
    expect(mockCheckConnectivity).not.toHaveBeenCalled();
  });

  it('should NOT trigger probe for ApiError (handled separately)', () => {
    const apiError = new ApiError({
      name: 'ApiError',
      message: 'Server error',
      status: 500,
    } as any);
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
