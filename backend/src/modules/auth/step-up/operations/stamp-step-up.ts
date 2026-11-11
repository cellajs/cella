import type { Context } from 'hono';
import type { Env } from '#/core/context';
import { setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import type { StepUpProof } from '#/modules/auth/sessions/sessions-db';
import { updateSessionSteppedUp } from '#/modules/auth/sessions/sessions-queries';
import { stepUpWindow } from '#/modules/auth/step-up/helpers/step-up';
import { newHashedToken } from '#/utils/hash-token';

/**
 * Stamps this request's session stepped up by `via` and hands this browser the step-up cookie the stamp counts with,
 * for the step-up window: a copy of the session cookie made before the proof lacks it.
 * @returns Whether the session was stamped; false once it ended.
 */
export const stampStepUp = async (ctx: Context<Env>, via: StepUpProof): Promise<boolean> => {
  const { raw, hash } = newHashedToken();
  const stamped = await updateSessionSteppedUp(ctx, { id: ctx.var.session.id, userId: ctx.var.user.id, via, secretHash: hash });
  if (stamped) setAuthCookie(ctx, 'session-step-up', raw, stepUpWindow);
  return !!stamped;
};
