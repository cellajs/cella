import { useSearch } from '@tanstack/react-router';
import { appConfig } from 'shared';

/**
 * Validates a post-auth redirect target, falling back to the default redirect path. Only
 * same-origin absolute paths pass (`//host` is scheme-relative and rejected). UX-only guard;
 * the backend re-validates before any 302.
 */
export function resolvePostAuthRedirect(redirect: string | undefined): string {
  return redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : appConfig.defaultRedirectPath;
}

/**
 * Validated post-auth redirect path from the current route's `?redirect=` search param, falling
 * back to the default redirect path.
 */
export function usePostAuthRedirect() {
  const { redirect } = useSearch({ strict: false });
  return resolvePostAuthRedirect(redirect);
}
