import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// onError dispatches by severity (toaster.error/warning/info), so the mock needs those methods.
const mockToaster = Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() });
const mockTeardownUserState = vi.fn();

vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: mockToaster }));
vi.mock('~/routes/router', () => ({ router: { navigate: vi.fn() } }));
vi.mock('~/utils/teardown-user-state', () => ({ teardownUserState: mockTeardownUserState }));
// A translation is its own key; a test names the keys that exist.
const knownKeys = vi.hoisted(() => new Set<string>());
vi.mock('i18next', () => {
  const t = (key: string) => key;
  const exists = (key: string) => knownKeys.has(key);
  return { default: { t, exists }, t, exists };
});

const { ApiError } = await import('~/lib/api');
const { onError } = await import('~/query/on-error');

// A 401 is a lost session only when the session guards say so; a refused proof (a wrong authenticator code on the
// MFA toggle) keeps the user signed in.
describe('onError 401 handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', new URL('https://app.example/organizations/acme'));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('signs the user out over a 401 only when the session is gone, never over a refused second factor', () => {
    onError(new ApiError({ name: 'ApiError', status: 401, type: 'invalid_token', path: '/me/mfa', severity: 'warn' }));
    expect(mockTeardownUserState).not.toHaveBeenCalled();

    onError(new ApiError({ name: 'ApiError', status: 401, type: 'session_revoked', path: '/organizations' }));
    // `false` keeps the local database, and the offline work in it, for the same user's next sign-in.
    expect(mockTeardownUserState).toHaveBeenCalledWith(false);
  });
});

it('toasts a fatal failure as an error', () => {
  vi.clearAllMocks();
  knownKeys.add('error:server_error');
  onError(new ApiError({ status: 500, type: 'server_error', severity: 'fatal', requestId: 'req-5' }));

  expect(mockToaster.error).toHaveBeenCalledWith('error:server_error', expect.anything());
  expect(mockToaster.info).not.toHaveBeenCalled();
});
