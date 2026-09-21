import { appConfig } from 'shared';
import { sendAccountSecurityEmail } from '#/modules/auth/general/helpers/send-account-security-email';
import type { SignInContext } from '#/modules/auth/general/helpers/session';
import type { UserModel } from '#/modules/user/user-db';

type SignInNotice = {
  user: UserModel;
  isSystemAdmin: boolean;
  context: SignInContext;
};

/** Security mails a completed sign-in gives rise to. Fire-and-forget: a mail problem never undoes a sign-in. */
export const notifySignIn = ({ user, isSystemAdmin, context }: SignInNotice) => {
  // A system admin session goes to the security inbox. Skipped in development, where every local sign-in would mail it.
  if (isSystemAdmin && appConfig.mode !== 'development') {
    sendAccountSecurityEmail({ email: appConfig.securityEmail, name: 'Security' }, 'sysadmin-signin', {
      email: user.email,
      ip: context.rawIp ?? 'unknown',
      timestamp: new Date().toISOString(),
    });
  }
};
