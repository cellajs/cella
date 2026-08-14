import { appConfig } from 'shared';
import { isValidRedirectPath } from '#/utils/is-redirect-url';

/**
 * Returns the appropriate redirect path after authentication.
 * New users (never signed in) are sent to the welcome/onboarding page.
 */
export const getPostAuthRedirectPath = (user: { lastSignInAt: string | null }) => {
  return user.lastSignInAt ? appConfig.defaultRedirectPath : appConfig.welcomeRedirectPath;
};

/**
 * Resolves the final post-auth redirect path for all sign-in strategies.
 * Order: MFA challenge (carrying the redirect along) → validated explicit redirect → welcome/default.
 *
 * An explicit redirect wins over the welcome page. Untrusted input is re-validated here so callers
 * can pass stored token values or cookie payloads directly.
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

  // A deep link targeting home would still be bounced to welcome by the frontend onboarding
  // guard; mark it to skip that since the redirect was explicit.
  const resolved = new URL(explicitRedirect, appConfig.frontendUrl);
  if (resolved.pathname === appConfig.defaultRedirectPath) {
    resolved.searchParams.set('skipWelcome', 'true');
  }

  return `${resolved.pathname}${resolved.search}${resolved.hash}`;
};
