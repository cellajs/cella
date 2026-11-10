import { appConfig } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// onError dispatches by severity (toaster.error/warning/info), so the mock needs those methods.
const mockToaster = Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), info: vi.fn(), success: vi.fn() });
/** Leaves the page as the real teardown does, before the user goes. */
const mockTeardownUserState = vi.fn(async (_wipe: boolean, leave?: () => Promise<unknown>) => {
  await leave?.();
});
let tearingDown = false;
/** The router as the handler reads it: where to go, and whether the page it is on needs an account. */
const mockRouter = { navigate: vi.fn(), state: { matches: [{ staticData: { isAuth: true } }] } };

vi.mock('~/modules/common/toaster/toaster', () => ({ toaster: mockToaster }));
vi.mock('~/routes/router', () => ({ router: mockRouter }));
vi.mock('~/utils/teardown-user-state', () => ({ teardownUserState: mockTeardownUserState, isTearingDown: () => tearingDown }));
vi.mock('~/query/local-user-storage', () => ({ localUserStorageReady: () => Promise.resolve() }));
// A translation is its own key; a test names the keys that exist.
const knownKeys = vi.hoisted(() => new Set<string>());
vi.mock('i18next', () => {
  const t = (key: string) => key;
  const exists = (key: string) => knownKeys.has(key);
  return { default: { t, exists }, t, exists };
});

const { ApiError } = await import('~/lib/api');
const { userStore } = await import('~/modules/user/user-store');
const { onError } = await import('~/query/on-error');

const person = { id: 'user-1', email: 'user@example.test' };
const demo = { id: 'demo-1', email: `demo-1@${appConfig.demo.addressDomain}` };
const onPage = (isAuth: boolean) => {
  mockRouter.state.matches = [{ staticData: { isAuth } }];
};
const noToast = () => {
  for (const type of ['error', 'warning', 'info'] as const) expect(mockToaster[type]).not.toHaveBeenCalled();
};

// A 401 is a lost session only when the session guards say so; a refused proof (a wrong authenticator code on the
// MFA toggle) keeps the user signed in.
describe('onError 401 handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tearingDown = false;
    userStore.getState().reset();
    onPage(true);
    vi.stubGlobal('location', new URL('https://app.example/organizations/acme'));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('signs the user out over a 401 only when the session is gone, never over a refused second factor', async () => {
    userStore.setState({ user: person as never });
    onError(new ApiError({ status: 401, type: 'invalid_token', path: '/me/mfa', severity: 'warn' }));
    expect(mockTeardownUserState).not.toHaveBeenCalled();

    onError(new ApiError({ status: 401, type: 'session_revoked', path: '/organizations' }));
    // `false` keeps the local database, and the offline work in it, for the same user's next sign-in.
    expect(mockTeardownUserState).toHaveBeenCalledWith(false, expect.any(Function));
    await vi.waitFor(() =>
      expect(mockRouter.navigate).toHaveBeenCalledWith({
        to: '/auth/authenticate',
        search: { fromRoot: true, redirect: '/organizations/acme' },
      }),
    );
  });

  it('begins no second teardown over the 401s of requests still in flight while the first is under way', async () => {
    userStore.setState({ user: person as never });
    tearingDown = true;
    onError(new ApiError({ status: 401, type: 'session_expired', path: '/organizations' }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTeardownUserState).not.toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('keeps a person signed in over a /me probe without a session, which a route guard answers, and shows no error', async () => {
    userStore.setState({ user: person as never });
    onError(new ApiError({ status: 401, type: 'no_session', path: '/me' }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockTeardownUserState).not.toHaveBeenCalled();
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    noToast();
  });

  it('forgets a demo account over a lost session, database included, and leaves a page that needs an account for the about page', async () => {
    userStore.setState({ user: demo as never });
    onError(new ApiError({ status: 401, type: 'session_expired', path: '/me/memberships' }));

    await vi.waitFor(() => expect(mockTeardownUserState).toHaveBeenCalledWith(true, expect.any(Function)));
    await vi.waitFor(() => expect(mockRouter.navigate).toHaveBeenCalledWith({ to: '/about', replace: true }));
  });

  it('forgets a demo account over its /me probe too, quietly, and stays on a page that needs no account', async () => {
    userStore.setState({ user: demo as never });
    onPage(false);
    vi.stubGlobal('location', new URL('https://app.example/about'));
    onError(new ApiError({ status: 401, type: 'no_session', path: '/me' }));

    await vi.waitFor(() => expect(mockTeardownUserState).toHaveBeenCalledWith(true, expect.any(Function)));
    // The router import settles before any navigation would
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    noToast();
  });
});

it('toasts a fatal failure as an error', () => {
  vi.clearAllMocks();
  knownKeys.add('error:server_error');
  onError(new ApiError({ status: 500, type: 'server_error', severity: 'fatal', instance: 'req-5' }));

  expect(mockToaster.error).toHaveBeenCalledWith('error:server_error', expect.anything());
  expect(mockToaster.info).not.toHaveBeenCalled();
});
