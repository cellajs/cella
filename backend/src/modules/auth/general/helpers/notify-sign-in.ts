import { and, eq, gt } from 'drizzle-orm';
import { appConfig } from 'shared';
import { baseDb as db } from '#/db/db';
import { devicesTable } from '#/modules/auth/devices-db';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import type { SignInContext } from '#/modules/auth/general/helpers/session';
import type { AuthStrategy } from '#/modules/auth/sessions-db';
import type { UserModel } from '#/modules/user/user-db';
import { getIsoDate } from '#/utils/iso-date';
import { log } from '#/utils/logger';
import { TimeSpan } from '#/utils/time-span';

/** A browser the user had not signed in from, with the sign-in before this one (null for a brand-new account). */
export type NewDevice = { deviceIdHash: string; previousSignInAt: string | null };

type SignInNotice = {
  user: UserModel;
  isSystemAdmin: boolean;
  context: SignInContext;
  strategy: AuthStrategy;
  newDevice: NewDevice | null;
};

/** These sign-ins went through the user's inbox: a second mail tells the owner nothing, and an intruder in the inbox deletes it. */
const inboxStrategies: AuthStrategy[] = ['magic', 'email'];

/** New sign-in notices per user per window. Covers browsers that drop cookies on exit; only notices actually sent spend it. */
const NOTICE_BUDGET = 3;
const NOTICE_WINDOW = new TimeSpan(24, 'h');

const strategyLabels: Record<AuthStrategy, string> = {
  passkey: 'Passkey',
  totp: 'Authenticator app',
  github: 'GitHub',
  google: 'Google',
  microsoft: 'Microsoft',
  magic: 'Magic link',
  email: 'Email',
};

/** Country name in the reader's language; GeoIP gives an ISO code, or nothing when its database is absent. */
const countryName = (code: string | null, language: string) => {
  if (!code) return 'unknown';
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** Security mails a completed sign-in gives rise to. Fire-and-forget: a mail problem never undoes a sign-in. */
export const notifySignIn = ({ user, isSystemAdmin, context, strategy, newDevice }: SignInNotice) => {
  // A system admin session goes to the security inbox. Skipped in development, where every local sign-in would mail it.
  if (isSystemAdmin && appConfig.mode !== 'development') {
    sendAccountSecurityEmail({ email: appConfig.securityEmail, name: 'Security' }, 'sysadmin-signin', {
      email: user.email,
      ip: context.rawIp ?? 'unknown',
      timestamp: new Date().toISOString(),
    });
  }

  if (newDevice) void notifyNewSignIn({ user, context, strategy, newDevice });
};

/**
 * Tells the user their account was signed in to from a browser they had not used before. Silent for a first-ever sign-in (it
 * would land next to the welcome mail), for sign-ins through the inbox, and once the daily budget is spent. Never throws.
 */
export const notifyNewSignIn = async ({
  user,
  context,
  strategy,
  newDevice,
}: Pick<SignInNotice, 'user' | 'context' | 'strategy'> & { newDevice: NewDevice }) => {
  if (!newDevice.previousSignInAt || inboxStrategies.includes(strategy)) return;

  try {
    const since = new Date(Date.now() - NOTICE_WINDOW.milliseconds()).toISOString();
    const sent = await db.$count(
      devicesTable,
      and(eq(devicesTable.userId, user.id), gt(devicesTable.notifiedAt, since)),
    );

    if (sent >= NOTICE_BUDGET) {
      log.info('New sign-in notice skipped: daily budget spent', { userId: user.id });
      return;
    }

    await db
      .update(devicesTable)
      .set({ notifiedAt: getIsoDate() })
      .where(and(eq(devicesTable.userId, user.id), eq(devicesTable.deviceIdHash, newDevice.deviceIdHash)));

    sendAccountSecurityEmail(user, 'new-sign-in', {
      timestamp: `${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC`,
      browser: context.device.browser ?? 'unknown',
      os: context.device.os ?? 'unknown',
      country: countryName(context.country, user.language),
      strategy: strategyLabels[strategy],
      accountUrl: `${appConfig.frontendUrl}/account`,
    });
  } catch (err) {
    log.error('Failed to send new sign-in notice', { userId: user.id, err });
  }
};
