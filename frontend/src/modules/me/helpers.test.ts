import { beforeEach, describe, expect, it, vi } from 'vitest';

const reload = vi.fn();
vi.stubGlobal('window', { location: { reload } });

/** What the server answers on `/me`: whoever this browser's cookies say it is. */
const server = vi.hoisted(() => ({ me: null as unknown }));

vi.mock('sdk', () => ({ getMe: vi.fn(async () => server.me) }));
// The store follows the user's language; no translations are loaded here.
vi.mock('i18next', () => ({ default: { language: 'en', changeLanguage: vi.fn() } }));
vi.mock('~/env', () => ({ isDebugMode: false }));

const { userStore } = await import('~/modules/user/user-store');
const { getAndSetMe } = await import('~/modules/me/helpers');

const person = (id: string, name: string) => ({ id, name, slug: id, thumbnailUrl: null, email: `${id}@example.test`, language: 'en' });
const first = person('user-1', 'Ada First');
const second = person('user-2', 'Uma Second');

const state = () => userStore.getState();
const lastUserOf = ({ id, email }: typeof first) => ({ id, email });

describe('who this browser is, as /me answers it', () => {
  beforeEach(() => {
    state().reset();
    reload.mockClear();
  });

  it('must not keep the caches of a user who signed out: another account signing in on this browser reloads', async () => {
    server.me = { user: first, isSystemAdmin: false };
    await getAndSetMe();
    expect(state()).toMatchObject({ user: first, lastUser: lastUserOf(first) });
    expect(reload).not.toHaveBeenCalled();

    server.me = { user: second, isSystemAdmin: false };
    await getAndSetMe();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(state()).toMatchObject({ user: second, lastUser: lastUserOf(second) });
  });
});
