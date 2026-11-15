import type { Context } from 'hono';
import { appConfig } from 'shared';
import { frontendRedirectPath } from '#/utils/frontend-redirect-path';

/**
 * Resolves the final post-auth path: MFA challenge (carrying the redirect along), then validated explicit redirect, then the default.
 * Untrusted input is re-validated here, so callers can pass stored token values or cookie payloads directly.
 */
export const resolvePostAuthRedirectPath = ({ redirectPath, mfaPath }: { redirectPath?: string | null; mfaPath?: string | null }) => {
  const explicitRedirect = frontendRedirectPath(redirectPath);

  // MFA interrupts the flow; hand the redirect to the MFA page so it survives the challenge.
  if (mfaPath) {
    return explicitRedirect ? `${mfaPath}?redirect=${encodeURIComponent(explicitRedirect)}` : mfaPath;
  }

  return explicitRedirect ?? appConfig.defaultRedirectPath;
};

/** Redirects a browser navigation: 303 after a form post, so the browser follows it with a GET (RFC 9110 §15.4.4), else 302. */
export const navigationRedirect = (ctx: Context, url: string | URL): Response => ctx.redirect(url, ctx.req.method === 'POST' ? 303 : 302);
