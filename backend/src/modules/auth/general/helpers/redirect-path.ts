import { appConfig } from 'shared';

/**
 * Returns the appropriate redirect path after authentication.
 * New users (never signed in) are sent to the welcome/onboarding page.
 */
export const getPostAuthRedirectPath = (user: { lastSignInAt: string | null }) => {
  return user.lastSignInAt ? appConfig.defaultRedirectPath : appConfig.welcomeRedirectPath;
};
