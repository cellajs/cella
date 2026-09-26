import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { xMiddleware } from '#/core/x-middleware';
import { requireStepUp } from '#/modules/auth/step-up/helpers/step-up';

/**
 * Account-security actions (factors, MFA, provider connect, OAuth consent, account deletion, minting an API key) need
 * more than a session: a recent proof of the user's presence on this very session, and never an impersonation. Runs
 * after `userGuard`; a refusal is 403 `step_up_required` naming what the user can offer.
 */
export const stepUpGuard = xMiddleware(
  {
    functionName: 'stepUpGuard',
    type: 'x-guard',
    name: 'stepUp',
    description:
      'Requires a recent proof of presence on this session: the enrolled passkey or TOTP, else a fresh sign-in or a confirmed email link. Refuses impersonation.',
  },
  async (ctx, next) => {
    await requireStepUp(ctx.var.session);
    await next();
  },
);

/** A request body carrying its own second factor, as PUT /me/mfa takes one. */
const carriesFactorProof = async (ctx: Context<Env>) => {
  const body: unknown = await ctx.req.json().catch(() => null);
  return !!body && typeof body === 'object' && ('passkeyData' in body || 'totpCode' in body);
};

/**
 * `stepUpGuard` for a route that verifies a second factor on the request itself (PUT /me/mfa): a request carrying one
 * goes on to the handler, which checks it behind the route's failure limiter, and counts as its step-up. Any other
 * request needs a stepped-up session. Impersonation is refused either way.
 */
export const stepUpOrFactorProofGuard = xMiddleware(
  {
    functionName: 'stepUpOrFactorProofGuard',
    type: 'x-guard',
    name: 'stepUpOrFactorProof',
    description:
      'Requires a recent proof of presence on this session, or a passkey or TOTP proof on the request itself. Refuses impersonation.',
  },
  async (ctx, next) => {
    const { session } = ctx.var;
    if (session.type === 'impersonation' || !(await carriesFactorProof(ctx))) await requireStepUp(session);
    await next();
  },
);
