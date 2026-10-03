import { beforeEach, describe, expect, it, vi } from 'vitest';

const reload = vi.fn();
vi.stubGlobal('window', { location: { reload } });

/** What the server answers on `/me`: whoever this browser's cookies say it is. */
const server = vi.hoisted(() => ({ me: null as unknown }));

vi.mock('sdk', () => ({
  getMe: vi.fn(async () => server.me),
  getMyAuth: vi.fn(),
  startImpersonation: vi.fn(async () => {}),
  stopImpersonation: vi.fn(async () => {}),
}));
// The store follows the user's language; no translations are loaded here.
vi.mock('i18next', () => ({ default: { language: 'en', changeLanguage: vi.fn() } }));
vi.mock('~/env', () => ({ isDebugMode: false }));
vi.mock('~/modules/me/query', () => ({ meKeys: { all: ['me'], memberships: ['me', 'memberships'] } }));
vi.mock('~/query/query-client', () => ({ queryClient: { removeQueries: vi.fn() } }));
vi.mock('~/query/realtime/stream-store', () => ({ appStreamManager: { reconnect: vi.fn() } }));

const { getMe } = await import('sdk');
const { useUserStore } = await import('~/modules/user/user-store');
const { getAndSetMe, startImpersonationFlow, stopImpersonationFlow } = await import('~/modules/me/helpers');

const person = (id: string, name: string) => ({ id, name, slug: id, thumbnailUrl: null, email: `${id}@example.test`, language: 'en' });
const admin = person('admin-1', 'Ada Admin');
const target = person('user-1', 'Uma User');
const adminRef = { id: admin.id, name: admin.name, slug: admin.slug, thumbnailUrl: null, entityType: 'user' as const };

const asAdmin = { user: admin, isSystemAdmin: true, impersonator: null };
const asTarget = { user: target, isSystemAdmin: false, impersonator: adminRef };

const state = () => useUserStore.getState();
const lastUserOf = ({ id, email }: typeof admin) => ({ id, email });

describe('who this browser is, as /me answers it', () => {
  beforeEach(() => {
    state().reset();
    reload.mockClear();
  });

  it('must not take an impersonated user for the browser’s own: the admin stays behind them and stays the last user', async () => {
    server.me = asAdmin;
    await getAndSetMe();
    server.me = asTarget;
    await getAndSetMe();

    expect(state()).toMatchObject({ user: target, isSystemAdmin: false, impersonator: adminRef, lastUser: lastUserOf(admin) });
    expect(reload).not.toHaveBeenCalled();

    // The admin edits the user's profile: still nothing of the user becomes this browser's own.
    state().updateUser({ ...target, name: 'Uma Renamed' } as never);
    expect(state()).toMatchObject({ user: { name: 'Uma Renamed' }, lastUser: lastUserOf(admin) });
  });

  it('must not keep an impersonation the server ended: the next answer names the admin again', async () => {
    server.me = asTarget;
    await getAndSetMe();
    // The impersonation's hour passed, or another tab stopped it: the same browser now answers as its admin.
    server.me = asAdmin;
    await getAndSetMe();

    expect(state()).toMatchObject({ user: admin, isSystemAdmin: true, impersonator: null, lastUser: lastUserOf(admin) });
  });

  it('must not leave a stale tab unable to stop: the stop is answered and /me settles who is signed in', async () => {
    useUserStore.setState({ user: target as never, impersonator: adminRef, lastUser: lastUserOf(admin) });
    server.me = asAdmin;

    await stopImpersonationFlow();

    expect(state()).toMatchObject({ user: admin, impersonator: null });
    expect(reload).not.toHaveBeenCalled();
  });

  it('must not hold the admin’s own state while /me is still asked who the impersonated user is', async () => {
    server.me = asAdmin;
    await getAndSetMe();

    let whileAsking: unknown;
    vi.mocked(getMe).mockImplementationOnce((async () => {
      whileAsking = state().impersonator;
      return asTarget;
    }) as never);
    await startImpersonationFlow(target.id);

    expect(whileAsking).toEqual(adminRef);
    expect(state()).toMatchObject({ user: target, impersonator: adminRef, lastUser: lastUserOf(admin) });
  });

  it('reloads when another account signs in on this browser (positive control)', async () => {
    server.me = asAdmin;
    await getAndSetMe();
    server.me = { user: target, isSystemAdmin: false, impersonator: null };
    await getAndSetMe();

    expect(reload).toHaveBeenCalledTimes(1);
  });
});
