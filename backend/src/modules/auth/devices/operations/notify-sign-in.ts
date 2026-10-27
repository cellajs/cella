import { appConfig } from 'shared';
import { baseDb } from '#/db/db';
import { countNotifiedDevices, updateDeviceNotifiedAt } from '#/modules/auth/devices/devices-queries';
import { sendAccountSecurityEmail, sendSecurityInboxEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import { strategyLabels } from '#/modules/auth/general/helpers/strategy-labels';
import type { SignInContext } from '#/modules/auth/sessions/helpers/sign-in-context';
import type { AuthStrategy } from '#/modules/auth/sessions/sessions-db';
import type { UserModel } from '#/modules/user/user-db';
import { isoDateAgo } from '#/utils/iso-date';
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
const noticeBudget = 3;
const noticeWindow = new TimeSpan(24, 'h');

/** Notices go out fire-and-forget, without a request, on the base pool. */
const dbCtx = { var: { db: baseDb } };

/** Security mails a completed sign-in gives rise to. Fire-and-forget: a mail problem never undoes a sign-in. */
export const notifySignIn = ({ user, isSystemAdmin, context, strategy, newDevice }: SignInNotice) => {
  // A system admin session goes to the security inbox. Skipped in development, where every local sign-in would mail it.
  if (isSystemAdmin && appConfig.mode !== 'development') {
    sendSecurityInboxEmail('sysadmin-signin', { email: user.email, ip: context.rawIp ?? 'unknown' });
  }

  if (newDevice) void notifyNewSignIn({ user, strategy, newDevice });
};

/**
 * Tells the user their account was signed in to from a browser they had not used before. Sends nothing for an account's
 * first sign-in, which has no earlier browser to differ from, for sign-ins through the inbox, and once the daily budget
 * is spent. Never throws.
 */
export const notifyNewSignIn = async ({ user, strategy, newDevice }: Pick<SignInNotice, 'user' | 'strategy'> & { newDevice: NewDevice }) => {
  if (!newDevice.previousSignInAt || inboxStrategies.includes(strategy)) return;

  try {
    const sent = await countNotifiedDevices(dbCtx, { userId: user.id, since: isoDateAgo(noticeWindow) });

    if (sent >= noticeBudget) {
      log.info('New sign-in notice skipped: daily budget spent', { userId: user.id });
      return;
    }

    await updateDeviceNotifiedAt(dbCtx, { userId: user.id, deviceIdHash: newDevice.deviceIdHash });

    // Country, browser and time come with the mail's request details: this runs inside the sign-in's request.
    sendAccountSecurityEmail(user, 'new-sign-in', { strategy: strategyLabels[strategy], accountUrl: `${appConfig.frontendUrl}/account` });
  } catch (err) {
    log.error('Failed to send new sign-in notice', { userId: user.id, err });
  }
};
