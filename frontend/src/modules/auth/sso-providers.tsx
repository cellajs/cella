import { queryOptions, useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { BuildingIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type GetAuthHealthResponse, getSsoEntry } from 'sdk';
import { appConfig } from 'shared';
import { safeRedirectPath } from '~/modules/auth/redirect-path';
import { invitationResumePath } from '~/modules/auth/use-post-auth-redirect';
import { Button } from '~/modules/ui/button';

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

/** What an institution's entry page shows; public by the connection id. */
export const ssoEntryQueryOptions = (connectionId: string) =>
  queryOptions({ queryKey: ['sso-entry', connectionId], queryFn: () => getSsoEntry({ path: { connectionId } }), retry: false });

interface SsoProvidersProps {
  /** The institution the context names (an invitation's organization): its button comes first. */
  connectionId?: string;
  /** Federations with a connected institution: one "sign in with your institution" button each, through the federation's own picker. */
  federations?: GetAuthHealthResponse['federations'];
}

/**
 * The institution sign-in buttons. An invitation in hand resumes after the sign-in, on the confirm step, so SSO never
 * runs the invite flow itself; otherwise the explicit redirect is forwarded like the provider buttons do.
 */
export function SsoProviders({ connectionId, federations = [] }: SsoProvidersProps) {
  const { t } = useTranslation();
  const { tokenId, redirect } = useSearch({ from: '/_public/auth/authenticate' });

  const { data: entry } = useQuery({ ...ssoEntryQueryOptions(connectionId ?? ''), enabled: !!connectionId });
  const redirectAfter = tokenId ? invitationResumePath(tokenId) : safeRedirectPath(redirect);

  const contextual = connectionId && entry?.status === 'active' ? entry : null;
  const items = [
    ...(contextual
      ? [
          {
            href: ssoStartUrl({ connectionId: contextual.id }, { redirectAfter }),
            label: t('c:sign_in_with_institution', { institution: contextual.institution.displayName }),
          },
        ]
      : []),
    // The generic entrance of the federation the context already names would lead to the same institution.
    ...federations
      .filter((federation) => federation.key !== contextual?.federation.key)
      .map((federation) => ({
        href: ssoStartUrl({ federation: federation.key }, { redirectAfter }),
        label: `${t('c:sign_in_with_your_institution')} ${t('c:sign_in_via_federation', { federation: federation.label })}`,
      })),
  ];

  if (!items.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <Button key={item.href} type="button" variant="plain" render={<a href={item.href} />}>
          <BuildingIcon />
          <span>{item.label}</span>
        </Button>
      ))}
    </div>
  );
}
