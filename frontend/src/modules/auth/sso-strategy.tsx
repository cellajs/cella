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

/** The backend route that starts an SSO round trip: pinned to an institution's connection, or at a federation at large. */
export const ssoStartUrl = (
  target: { connectionId: string } | { federation: string },
  { kind = 'auth', redirectPath }: { kind?: 'auth' | 'connect'; redirectPath?: string | null } = {},
) => {
  const base =
    'connectionId' in target
      ? `${appConfig.backendAuthUrl}/sso/connections/${target.connectionId}/start`
      : `${appConfig.backendAuthUrl}/sso/federations/${target.federation}/start`;
  const params = new URLSearchParams({ kind });
  if (redirectPath) params.set('redirectPath', redirectPath);
  return `${base}?${params}`;
};

const federationLogos: Partial<Record<FederationKey, IconComponent>> = Object.fromEntries(
  Object.entries(appConfig.federations).flatMap(([key, { name, logoUrl }]) =>
    logoUrl ? [[key, () => <img src={logoUrl} alt={name} className="h-5 shrink-0" draggable={false} />]] : [],
  ),
);

interface SsoAlternatives {
  /** The connection in context, when active. */
  institution: AuthAlternative | null;
  federations: AuthAlternative[];
  isLoading: boolean;
}

/** The institution ways in, none with the strategy off; an invitation in hand resumes on the confirm step: SSO never runs the invite flow. */
export function useSsoAlternatives(connectionId?: string, federations: GetAuthHealthResponse['federations'] = []): SsoAlternatives {
  const { t } = useTranslation();
  const { tokenId, redirect } = useSearch({ from: '/_public/auth/authenticate' });

  const { data: entry, isLoading } = useQuery(ssoEntryQueryOptions(connectionId));
  const redirectPath = tokenId ? invitationResumePath(tokenId) : safeRedirectPath(redirect);

  if (!isStrategyEnabled('sso')) return { institution: null, federations: [], isLoading: false };

  const contextual = entry?.status === 'active' ? entry : null;
  const institution = contextual && {
    id: contextual.id,
    icon: BuildingIcon,
    label: t('c:sign_in_with_institution', { institution: contextual.institution.name }),
    shortLabel: contextual.institution.name,
    href: ssoStartUrl({ connectionId: contextual.id }, { redirectPath }),
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
          label: logo ? t('c:sign_in_with_your_institution') : t('c:sign_in_with_your_institution_via', { federation: federation.name }),
          shortLabel: t('c:your_institution'),
          meta: logo ? undefined : federation.name,
          href: ssoStartUrl({ federation: federation.key }, { redirectPath }),
        };
      }),
  };
}
