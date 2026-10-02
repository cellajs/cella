import type { Context } from 'hono';
import { z } from 'zod';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';
import { assertSwitchOn } from '#/middlewares/config-switch';
import { deleteAuthCookie, getAuthCookie, setAuthCookie } from '#/modules/auth/general/helpers/cookie';
import { sendMagicLinkOp } from '#/modules/auth/magic/operations/send-magic-link';
import { TimeSpan } from '#/utils/time-span';

/** How long the offer stands: the time to read the error page and press the button. */
const recoveryWindow = new TimeSpan(10, 'm');

const recoverySchema = z.object({ email: z.email(), connectionId: z.uuid() });

interface SsoCollision {
  /** The address the institution asserted, which an account already holds. */
  email: string;
  connectionId: string;
}

/**
 * Remembers, in this browser only, that an institution just asserted an address an existing account holds. The error
 * page offers a sign-in link to that address on the strength of it, so the address never travels in a URL and no one
 * can ask for the link without having signed in at the institution first.
 */
export const rememberSsoCollision = (ctx: Context<Env>, collision: SsoCollision) =>
  setAuthCookie(ctx, 'sso-recovery', JSON.stringify(collision), recoveryWindow);

/** The path the recovery link lands on: the account page, offering to connect the institution account. */
const ssoConnectPath = (connectionId: string) => `/account?connect=${connectionId}#authentication`;

/**
 * Mails a magic link to the address of the collision this browser remembers, returning to the account page's connect.
 * The offer is spent by asking: another link takes another sign-in at the institution.
 * @returns The address the link went to, for the "check your inbox" step.
 * @throws AppError 400 `forbidden_strategy` while magic links are off, 401 `sso_recovery_expired` without a live offer.
 */
export const sendSsoRecoveryLinkOp = async (ctx: Context<Env>) => {
  assertSwitchOn({ strategy: 'magic' });

  const remembered = await getAuthCookie(ctx, 'sso-recovery');
  const collision = remembered ? recoverySchema.safeParse(safeJson(remembered)) : undefined;
  if (!collision?.success) throw new AppError(401, 'sso_recovery_expired', 'warn');

  deleteAuthCookie(ctx, 'sso-recovery');

  const { email, connectionId } = collision.data;
  await sendMagicLinkOp(ctx, { email, redirect: ssoConnectPath(connectionId), assertedThrough: connectionId });

  return { email };
};

const safeJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};
