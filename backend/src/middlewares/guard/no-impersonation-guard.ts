import { AppError } from '#/core/error';
import { xMiddleware } from '#/core/x-middleware';
import type { SessionFacts } from '#/modules/auth/sessions-db';

/**
 * Refuses an impersonation: the admin acts as the user, never on the account itself, its sessions or how it is
 * protected. The one spelling of this answer, for the guard below and for `requireStepUp`.
 * @throws AppError 403 `impersonation_forbidden`.
 */
export const refuseImpersonation = (session: SessionFacts): void => {
  if (session.type === 'impersonation') throw new AppError(403, 'impersonation_forbidden', 'warn');
};

/** After `userGuard`: the session must be the browser's own. Stepping up, revoking sessions, impersonating again. */
export const noImpersonationGuard = xMiddleware(
  {
    functionName: 'noImpersonationGuard',
    type: 'x-guard',
    name: 'noImpersonation',
    description: 'Refused while impersonating: the admin acts as the user, never on the account itself',
  },
  async (ctx, next) => {
    refuseImpersonation(ctx.var.session);
    await next();
  },
);
