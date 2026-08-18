import { useSearch } from '@tanstack/react-router';
import { appConfig } from 'shared';

/** Only same-origin absolute paths pass (`//host` is scheme-relative); the backend re-validates before any 302. */
export function resolvePostAuthRedirect(redirect: string | undefined): string {
  return redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : appConfig.defaultRedirectPath;
}

export function usePostAuthRedirect() {
  const { redirect } = useSearch({ strict: false });
  return resolvePostAuthRedirect(redirect);
}
