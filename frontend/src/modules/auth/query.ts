import { queryOptions, useMutation } from '@tanstack/react-query';
import { type GetTokenDataData, getAuthHealth, getPendingMagicLink, getPendingMfa, getSsoEntry, getTokenData } from 'sdk';
import { decideConsent, getConsentDetails } from '~/lib/oauth-interaction';
import { withStepUp } from '~/modules/auth/step-up';

type TokenType = GetTokenDataData['path']['type'];

const authKeys = {
  health: ['auth', 'health'] as const,
  token: (type: TokenType, tokenId?: string) => ['auth', 'token', type, tokenId] as const,
  pendingMagicLink: ['auth', 'magic', 'pending'] as const,
  pendingMfa: ['auth', 'mfa', 'pending'] as const,
  ssoEntry: (connectionId?: string) => ['auth', 'sso-entry', connectionId] as const,
  consent: { details: (uid: string) => ['auth', 'consent', uid] as const, decide: ['auth', 'consent', 'decide'] as const },
};

// Abort at the timeout, so a down backend never hangs on the browser default.
const healthTimeoutMs = 20000;

export const authHealthQueryOptions = queryOptions({
  queryKey: authKeys.health,
  queryFn: ({ signal }) => getAuthHealth({ signal: AbortSignal.any([signal, AbortSignal.timeout(healthTimeoutMs)]) }),
  staleTime: 0,
  refetchOnMount: 'always',
  retry: false,
});

/** What a token stands for; disabled without an id. It may name another address than the one signed in here: it stays out of the local database. */
export const tokenDataQueryOptions = (type: TokenType, tokenId?: string) =>
  queryOptions({
    queryKey: authKeys.token(type, tokenId),
    queryFn: () => getTokenData({ path: { type, id: tokenId ?? '' } }),
    enabled: !!tokenId,
    gcTime: 0,
    meta: { persist: false },
  });

/** The account the pending link signs in to. It may be another than the one signed in here: its email stays out of the local database. */
export const pendingMagicLinkQueryOptions = queryOptions({
  queryKey: authKeys.pendingMagicLink,
  queryFn: ({ signal }) => getPendingMagicLink({ signal }),
  retry: false,
  meta: { persist: false },
});

/** The account this browser's MFA challenge completes. The MFA route refetches it per visit and redirects without one, so no toast. */
export const pendingMfaQueryOptions = queryOptions({
  queryKey: authKeys.pendingMfa,
  queryFn: ({ signal }) => getPendingMfa({ signal }),
  retry: false,
  staleTime: Number.POSITIVE_INFINITY,
  meta: { persist: false, suppressGlobalErrorToast: true },
});

/** What an institution's entry page shows, public by the connection id; disabled without one. */
export const ssoEntryQueryOptions = (connectionId?: string) =>
  queryOptions({
    queryKey: authKeys.ssoEntry(connectionId),
    queryFn: () => getSsoEntry({ path: { connectionId: connectionId ?? '' } }),
    enabled: !!connectionId,
    retry: false,
  });

/** Bound to one interaction, gone when it is answered: never persisted, never retried. */
export const consentDetailsQueryOptions = (uid: string) =>
  queryOptions({
    queryKey: authKeys.consent.details(uid),
    queryFn: () => getConsentDetails(uid),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    meta: { persist: false, suppressGlobalErrorToast: true },
  });

/** The provider answers with where to send the browser next; a full navigation completes the flow. Accepting needs a step-up. */
export const useDecideConsentMutation = (uid: string) =>
  useMutation({
    mutationKey: authKeys.consent.decide,
    mutationFn: (accept: boolean) => (accept ? withStepUp(() => decideConsent(uid, true)) : decideConsent(uid, false)),
    onSuccess: ({ redirectTo }) => window.location.assign(redirectTo),
  });
