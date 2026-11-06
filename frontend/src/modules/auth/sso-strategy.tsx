import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { BuildingIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GetAuthHealthResponse } from 'sdk';
import { appConfig, type FederationKey, isStrategyEnabled } from 'shared';
import type { AuthAlternative } from '~/modules/auth/auth-alternatives';
import { invitationResumePath } from '~/modules/auth/post-auth-redirect';
import { ssoEntryQueryOptions } from '~/modules/auth/query';
import { safeRedirectPath } from '~/modules/auth/redirect-path';
import type { IconComponent } from '~/modules/common/icons/types';

const ssoEnabled = isStrategyEnabled('sso');

type SsoTarget = { connectionId: string } | { federation: string };

/** The backend route that starts an SSO round trip: pinned to an institution's connection, or at a federation at large. */
export const ssoStartUrl = (
  target: SsoTarget,
  { type = 'auth', redirectAfter }: { type?: 'auth' | 'connect'; redirectAfter?: string | null } = {},
) => {
  const base =
    'connectionId' in target
      ? `${appConfig.backendAuthUrl}/sso/connections/${target.connectionId}/start`
      : `${appConfig.backendAuthUrl}/sso/federations/${target.federation}/start`;
  const params = new URLSearchParams({ type });
  if (redirectAfter) params.set('redirectAfter', redirectAfter);
  return `${base}?${params}`;
};

const federationLogos: Partial<Record<FederationKey, IconComponent>> = Object.fromEntries(
  Object.entries(appConfig.federations).flatMap(([key, { label, logo }]) =>
    logo ? [[key, () => <img src={logo} alt={label} className="h-5 shrink-0" draggable={false} />]] : [],
  ),
);

interface SsoAlternatives {
  /** The connection in context, when active. */
  institution: AuthAlternative | null;
  federations: AuthAlternative[];
  isLoading: boolean;
}

/**
 * The institution ways in; none when the strategy is off. An invitation in hand resumes after the sign-in, on the
 * confirm step, so SSO never runs the invite flow itself.
 */
export function useSsoAlternatives(connectionId?: string, federations: GetAuthHealthResponse['federations'] = []): SsoAlternatives {
  const { t } = useTranslation();
  const { tokenId, redirect } = useSearch({ from: '/_public/auth/authenticate' });

  const { data: entry, isLoading } = useQuery(ssoEntryQueryOptions(connectionId));
  const redirectAfter = tokenId ? invitationResumePath(tokenId) : safeRedirectPath(redirect);

  if (!ssoEnabled) return { institution: null, federations: [], isLoading: false };

  const contextual = entry?.status === 'active' ? entry : null;
  const institution = contextual && {
    id: contextual.id,
    icon: BuildingIcon,
    label: t('c:sign_in_with_institution', { institution: contextual.institution.displayName }),
    shortLabel: contextual.institution.displayName,
    href: ssoStartUrl({ connectionId: contextual.id }, { redirectAfter }),
  };

  return {
    institution,
    isLoading,
    // The generic entrance of the federation the context already names would lead to the same institution.
    federations: federations
      .filter((federation) => federation.key !== contextual?.federation.key)
      .map((federation) => {
        // A logo names the federation; without one the label does.
        const logo = federationLogos[federation.key];
        return {
          id: federation.key,
          icon: logo ?? BuildingIcon,
          label: logo ? t('c:sign_in_with_your_institution') : t('c:sign_in_with_your_institution_via', { federation: federation.label }),
          shortLabel: t('c:your_institution'),
          meta: logo ? undefined : federation.label,
          href: ssoStartUrl({ federation: federation.key }, { redirectAfter }),
        };
      }),
  };
}
