import { useSearch } from '@tanstack/react-router';
import { appConfig } from 'shared';

/**
 * Validated post-auth redirect path from the current route's `?redirect=` search param, falling
 * back to the default redirect path. UX-only guard; the backend re-validates before any 302.
 */
export function usePostAuthRedirect() {
  const { redirect } = useSearch({ strict: false });
  return redirect?.startsWith('/') ? redirect : appConfig.defaultRedirectPath;
}
