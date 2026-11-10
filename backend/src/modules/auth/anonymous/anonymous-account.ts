import type { Context } from 'hono';
import type { UserFlags } from 'shared';
import type { DbContext, Env } from '#/core/context';
import { setUserSession } from '#/modules/auth/sessions/operations/create-session';
import type { UserModel } from '#/modules/user/user-db';
import { insertUsers } from '#/modules/user/user-queries';

/** RFC 2606 reserves `.invalid` for names that resolve nowhere: an anonymous account's placeholder address lives under it. */
const anonymousAddressDomain = 'anonymous.invalid';

interface InsertAnonymousUserOpts {
  id: string;
  name: string;
  slug: string;
  givenName?: string;
  userFlags?: Partial<UserFlags>;
}

/**
 * Inserts an account without an identity: a placeholder address no mail reaches and no `emails` row. Nothing signs it
 * in but the anonymous session minted for it ({@link startAnonymousSession}), it binds no invitation, and the API serves
 * it with `email: null` and `isAnonymous`. It goes with the last tenant that held it, or with the orphan sweep.
 */
export const insertAnonymousUser = async (ctx: DbContext, { id, name, slug, givenName, userFlags }: InsertAnonymousUserOpts) => {
  const [user] = await insertUsers(ctx, {
    users: [{ id, name, givenName, slug, email: `${id}@${anonymousAddressDomain}`, userFlags: { finishedOnboarding: true, ...userFlags } }],
  });
  return user;
};

/**
 * Signs this browser in to an anonymous account until `expiresAt`. The session stands stepped up for nothing and
 * reaches, beyond the tenants its memberships bind it to, only the routes that admit it (`xAnonymous`).
 */
export const startAnonymousSession = (ctx: Context<Env>, user: UserModel, { expiresAt }: { expiresAt: string }) =>
  setUserSession(ctx, user, 'anonymous', 'regular', { expiresAt });
