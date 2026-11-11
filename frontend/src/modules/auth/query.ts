import { queryOptions, useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  type GetTokenDataData,
  getAuthHealth,
  getPendingMagicLink,
  getPendingMfa,
  getSsoEntry,
  getTokenData,
  type RedeemLinkTokenData,
  redeemLinkToken,
  sendMagicLink,
} from 'sdk';
import type { ApiError } from '~/lib/api';
import { decideConsent, getConsentDetails } from '~/lib/oauth-interaction';
import { type MagicLinkMode, useAuthStore } from '~/modules/auth/auth-store';
import { invitationResumePath } from '~/modules/auth/post-auth-redirect';
import { withStepUp } from '~/modules/auth/step-up';

type TokenKind = GetTokenDataData['path']['kind'];

const authKeys = {
  health: ['auth', 'health'] as const,
  token: (kind: TokenKind, tokenId?: string) => ['auth', 'token', kind, tokenId] as const,
  pendingMagicLink: ['auth', 'magic', 'pending'] as const,
  pendingMfa: ['auth', 'mfa', 'pending'] as const,
  ssoEntry: (connectionId?: string) => ['auth', 'sso-entry', connectionId] as const,
  consent: { details: (uid: string) => ['auth', 'consent', uid] as const, decide: ['auth', 'consent', 'decide'] as const },
  redeemLink: ['auth', 'redeem-link'] as const,
};

// Abort at the timeout, so a down backend never hangs on the browser default.
const healthTimeoutMs = 20000;

/** For a page that says a failure in place: only a rate limit's wait still needs the toast. */
const isNotRateLimit = (error: ApiError) => error.status !== 429;

export const authHealthQueryOptions = queryOptions({
  queryKey: authKeys.health,
  queryFn: ({ signal }) => getAuthHealth({ signal: AbortSignal.any([signal, AbortSignal.timeout(healthTimeoutMs)]) }),
  staleTime: 0,
  refetchOnMount: 'always',
  meta: { suppressGlobalErrorToast: isNotRateLimit },
});

/** What a token stands for; disabled without an id. It may name another address than the one signed in here: it stays out of the local database. */
export const tokenDataQueryOptions = (kind: TokenKind, tokenId?: string) =>
  queryOptions({
    queryKey: authKeys.token(kind, tokenId),
    queryFn: () => getTokenData({ path: { kind, id: tokenId ?? '' } }),
    enabled: !!tokenId,
    gcTime: 0,
    meta: { persist: false },
  });

/** The account the pending link signs in to. It may be another than the one signed in here: its email stays out of the local database. */
export const pendingMagicLinkQueryOptions = queryOptions({
  queryKey: authKeys.pendingMagicLink,
  queryFn: ({ signal }) => getPendingMagicLink({ signal }),
  meta: { persist: false, suppressGlobalErrorToast: isNotRateLimit },
});

/** The account this browser's MFA challenge completes. The MFA route refetches it per visit and redirects without one, so no toast. */
export const pendingMfaQueryOptions = queryOptions({
  queryKey: authKeys.pendingMfa,
  queryFn: ({ signal }) => getPendingMfa({ signal }),
  staleTime: Number.POSITIVE_INFINITY,
  meta: { persist: false, suppressGlobalErrorToast: true },
});

/** What an institution's entry page shows, public by the connection id; disabled without one. */
export const ssoEntryQueryOptions = (connectionId?: string) =>
  queryOptions({
    queryKey: authKeys.ssoEntry(connectionId),
    queryFn: () => getSsoEntry({ path: { connectionId: connectionId ?? '' } }),
    enabled: !!connectionId,
  });

/** Bound to one interaction, gone when it is answered: never persisted. */
export const consentDetailsQueryOptions = (uid: string) =>
  queryOptions({
    queryKey: authKeys.consent.details(uid),
    queryFn: () => getConsentDetails(uid),
    staleTime: Number.POSITIVE_INFINITY,
    meta: { persist: false, suppressGlobalErrorToast: true },
  });

/** The provider answers with where to send the browser next; a full navigation completes the flow. Accepting needs a step-up. */
export const useDecideConsentMutation = (uid: string) =>
  useMutation({
    mutationKey: authKeys.consent.decide,
    mutationFn: (accept: boolean) => (accept ? withStepUp(() => decideConsent(uid, true)) : decideConsent(uid, false)),
    onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl),
  });

/** Mails the address a link from a step of the authenticate page; the server decides whether it signs in or signs up. */
export const useSendMagicLinkMutation = () => {
  const navigate = useNavigate();
  const { tokenId, redirect } = useSearch({ from: '/_public/auth/authenticate' });
  const setMagicLinkSent = useAuthStore((state) => state.setMagicLinkSent);

  return useMutation({
    // An invitation in hand: the magic link returns here, so it can be confirmed as the account signed in to.
    mutationFn: ({ email }: { email: string; mode: MagicLinkMode }) =>
      sendMagicLink({ body: { email, redirectPath: tokenId ? invitationResumePath(tokenId) : redirect } }),
    onSuccess: (_, { email, mode }) => setMagicLinkSent(email, mode),
    // An address an institution governs sends no link: its entry page takes over, keeping the redirect.
    onError: (error) => {
      const connectionId = error.type === 'sso_required' ? error.connectionId : undefined;
      if (typeof connectionId !== 'string') return;
      navigate({ to: '/auth/sso/$connectionId', params: { connectionId }, search: redirect ? { redirect } : {}, replace: true });
    },
  });
};

/** Redeems the link this browser holds; the server answers where the browser goes next, which a full navigation follows. */
export const useRedeemHeldLinkMutation = () =>
  useMutation({
    mutationKey: authKeys.redeemLink,
    mutationFn: (kind: RedeemLinkTokenData['path']['kind']) => redeemLinkToken({ path: { kind } }),
    onSuccess: ({ redirectUrl }) => window.location.assign(redirectUrl),
    meta: { suppressGlobalErrorToast: true },
  });
