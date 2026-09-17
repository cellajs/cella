import { useNavigate, useSearch } from '@tanstack/react-router';
import { appConfig } from 'shared';

/** Only same-origin absolute paths pass (`//host` is scheme-relative); the backend re-validates before any 302. */
export function resolvePostAuthRedirect(redirect: string | undefined): string {
  return redirect?.startsWith('/') && !redirect.startsWith('//') ? redirect : appConfig.defaultRedirectPath;
}

/** Where an invitation flow resumes after a sign-in that leaves the page (magic link): the authenticate page, now on its confirm step. */
export const invitationResumePath = (tokenId: string) => `/auth/authenticate?tokenId=${encodeURIComponent(tokenId)}`;

export function usePostAuthRedirect() {
  const { redirect } = useSearch({ strict: false });
  return resolvePostAuthRedirect(redirect);
}

/** Leaves the auth pages after an in-page sign-in. With an invitation token in hand, stays to confirm it as the account just signed in to. */
export function useNavigateAfterAuth() {
  const navigate = useNavigate();
  const { tokenId } = useSearch({ strict: false });
  const redirectPath = usePostAuthRedirect();

  return () =>
    tokenId
      ? navigate({ to: '/auth/authenticate', search: { tokenId }, replace: true })
      : navigate({ to: redirectPath, replace: true });
}
