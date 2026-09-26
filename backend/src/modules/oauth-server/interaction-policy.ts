import type { IncomingMessage, ServerResponse } from 'node:http';
import { Context } from 'hono';
import { interactionPolicy } from 'oidc-provider';
import { appConfig } from 'shared';
import { resolveSession } from '#/modules/auth/general/helpers/session';

/**
 * The user of the live app session a request to the authorization server presents, or null without one. It is read as
 * the API reads it: the session cookie, an impersonation layered on it, and the system access rules for the address.
 * An impersonation counts as nobody: it may not consent for the person, so it may not skip their consent either.
 * @param req - The request as Node delivers it; only its cookies, forwarding header and socket are read.
 * @param res - Its response, which the reader never writes.
 */
export async function appSessionUserId(req: IncomingMessage, res: ServerResponse): Promise<string | null> {
  const headers = new Headers();
  for (const name of ['cookie', 'x-forwarded-for']) {
    const value = req.headers[name];
    if (typeof value === 'string') headers.set(name, value);
  }
  const ctx = new Context(new Request(appConfig.oauthUrl, { headers }), { env: { incoming: req, outgoing: res } });
  const entry = await resolveSession(ctx).catch(() => null);
  if (!entry || entry.session.type === 'impersonation') return null;
  return entry.user.id;
}

/**
 * The provider's prompts plus one login check: the authorization server's own session in a browser counts only while
 * that browser's app session is live and belongs to the same user. Without the check the server answers a client at
 * once for whoever consented in the browser before, so the next person on a shared computer gets a code for them.
 * Where the app session cookie does not reach the request (a navigation another site starts), the login prompt sends
 * the person through the consent page, which reads the session itself.
 */
export function appInteractionPolicy(): interactionPolicy.DefaultPolicy {
  const policy = interactionPolicy.base();
  const login = policy.get('login');
  if (!login) throw new Error('The base interaction policy has no login prompt');
  login.checks.add(
    new interactionPolicy.Check(
      'app_session',
      'the app session in this browser does not belong to the signed-in account',
      // A request that may ask nobody (`prompt=none`) hears that someone has to sign in.
      'login_required',
      async (ctx) => {
        const accountId = ctx.oidc.session?.accountId;
        const signedIn = accountId && (await appSessionUserId(ctx.req, ctx.res)) === accountId;
        return signedIn ? interactionPolicy.Check.NO_NEED_TO_PROMPT : interactionPolicy.Check.REQUEST_PROMPT;
      },
    ),
  );
  return policy;
}
