import { beforeEach, describe, expect, it, vi } from 'vitest';

/** What the server answers on `/me`: whoever this browser's cookies say it is. */
const server = vi.hoisted(() => ({ me: null as unknown }));
const endSession = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('sdk', () => ({ getMe: vi.fn(async () => server.me) }));
vi.mock('~/modules/auth/end-session', () => ({ endSession }));
// The store follows the user's language; no translations are loaded here.
vi.mock('i18next', () => ({ default: { language: 'en', changeLanguage: vi.fn() } }));
vi.mock('~/env', () => ({ isDebugMode: false }));

const { userStore } = await import('~/modules/user/user-store');
const { getAndSetMe } = await import('~/modules/me/helpers');

const person = (id: string, name: string) => ({ id, name, slug: id, thumbnailUrl: null, email: `${id}@example.test`, languageCode: 'en' });
const first = person('user-1', 'Ada First');
const second = person('user-2', 'Uma Second');

const state = () => userStore.getState();
const lastUserOf = ({ id, email }: typeof first) => ({ id, email });

describe('who this browser is, as /me answers it', () => {
  beforeEach(() => {
    state().reset();
    endSession.mockClear();
  });

  it("must not hand one account's caches to another: /me naming another user than the live one ends the session as replaced", async () => {
    server.me = { user: first, isSystemAdmin: false };
    await getAndSetMe();
    expect(state()).toMatchObject({ user: first, lastUser: lastUserOf(first) });
    expect(endSession).not.toHaveBeenCalled();

    server.me = { user: second, isSystemAdmin: false };
    await getAndSetMe();

    expect(endSession).toHaveBeenCalledExactlyOnceWith('replaced');
    expect(state()).toMatchObject({ user: first, lastUser: lastUserOf(first) });
  });
});
