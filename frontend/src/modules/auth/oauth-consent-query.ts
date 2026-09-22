import { queryOptions, useMutation } from '@tanstack/react-query';
import type { ApiError } from '~/lib/api';
import { decideConsent, getConsentDetails } from '~/lib/oauth-interaction';

export const consentKeys = {
  details: (uid: string) => ['oauth-consent', uid] as const,
  decide: ['oauth-consent', 'decide'] as const,
};

/** Bound to one interaction, gone when it is answered: never persisted, never retried. */
export const consentDetailsQueryOptions = (uid: string) =>
  queryOptions({
    queryKey: consentKeys.details(uid),
    queryFn: () => getConsentDetails(uid),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    meta: { persist: false, suppressGlobalErrorToast: true },
  });

/** The provider answers with where to send the browser next; a full navigation completes the flow. */
export const useDecideConsentMutation = (uid: string) =>
  useMutation<{ redirectTo: string }, ApiError, boolean>({
    mutationKey: consentKeys.decide,
    mutationFn: (accept) => decideConsent(uid, accept),
    onSuccess: ({ redirectTo }) => window.location.assign(redirectTo),
  });
