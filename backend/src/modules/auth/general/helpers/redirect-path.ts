import { appConfig } from 'shared';
import { isValidRedirectPath } from '#/utils/is-redirect-url';

/** New users (never signed in) are sent to the welcome page. */
export const getPostAuthRedirectPath = (user: { lastSignInAt: string | null }) => {
  return user.lastSignInAt ? appConfig.defaultRedirectPath : appConfig.welcomeRedirectPath;
};

/**
 * Resolves the final post-auth path: MFA challenge (carrying the redirect along), then validated explicit redirect, then welcome or default.
 * Untrusted input is re-validated here, so callers can pass stored token values or cookie payloads directly.
 */
export const resolvePostAuthRedirectPath = (
  user: { lastSignInAt: string | null },
  { redirectPath, mfaPath }: { redirectPath?: string | null; mfaPath?: string | null } = {},
) => {
  const explicitRedirect = isValidRedirectPath(redirectPath);

  // MFA interrupts the flow; hand the redirect to the MFA page so it survives the challenge.
  if (mfaPath) {
    return explicitRedirect ? `${mfaPath}?redirect=${encodeURIComponent(explicitRedirect)}` : mfaPath;
  }

  if (!explicitRedirect) return getPostAuthRedirectPath(user);

  // A deep link targeting home would be bounced to welcome by the frontend onboarding guard; mark it to skip that.
  const resolved = new URL(explicitRedirect, appConfig.frontendUrl);
  if (resolved.pathname === appConfig.defaultRedirectPath) {
    resolved.searchParams.set('skipWelcome', 'true');
  }

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
};
