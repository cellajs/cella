import { useNavigate, useSearch } from '@tanstack/react-router';
import { appConfig } from 'shared';

/** Where an invitation flow resumes after signing in: the authenticate page, now on its confirm step. */
export const invitationResumePath = (tokenId: string) => `/auth/authenticate?tokenId=${encodeURIComponent(tokenId)}`;

/**
 * Where to go once signed in. An invitation token in hand wins, so it can be confirmed as the account just signed in to.
 * Otherwise only same-origin absolute paths pass (`//host` is scheme-relative); the backend re-validates before any 302.
 */
export function resolvePostAuthRedirect(redirect: string | undefined, tokenId?: string): string {
  if (tokenId) return invitationResumePath(tokenId);
  return redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : appConfig.defaultRedirectPath;
}

export function usePostAuthRedirect() {
  const { redirect, tokenId } = useSearch({ strict: false });
  return resolvePostAuthRedirect(redirect, tokenId);
}

/** Leaves the auth steps after an in-page sign-in. */
export function useNavigateAfterAuth() {
  const navigate = useNavigate();
  const to = usePostAuthRedirect();
  return () => navigate({ to, replace: true });
}
