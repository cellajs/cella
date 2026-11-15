import { onlineManager, useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { BuildingIcon, InfoIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type MeAuthData, startOAuthConnect } from 'sdk';
import { appConfig, isStrategyEnabled } from 'shared';
import { MfaSwitch } from '~/modules/auth/account/mfa-switch';
import { PasskeysList } from '~/modules/auth/account/passkeys-list';
import { meAuthQueryOptions } from '~/modules/auth/account/query';
import { SessionsList } from '~/modules/auth/account/sessions-list';
import { Totp } from '~/modules/auth/account/totp';
import { enabledOAuthProviders, OAuthProviderIcon } from '~/modules/auth/oauth-strategy';
import { ssoEntryQueryOptions } from '~/modules/auth/query';
import { ssoStartUrl } from '~/modules/auth/sso-strategy';
import { withStepUp } from '~/modules/auth/step-up';
import { ExpandableTile, ExpandableTileDetail } from '~/modules/common/expandable-tile';
import { HelpText } from '~/modules/common/help-text';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { ToolCard } from '~/modules/common/tool-card';
import { Accordion } from '~/modules/ui/accordion';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useCurrentUser } from '~/modules/user/user-store';
import { dateShort } from '~/utils/date-short';

export function AccountSessionsCard() {
  const { t } = useTranslation();

  return (
    <ToolCard label="c:sessions" description={t('c:sessions.text', { days: appConfig.retention.sessionDaysAfterExpiry })}>
      <SessionsList />
    </ToolCard>
  );
}

interface IdentityTileProps {
  /** The provider or connection id. */
  value: string;
  icon: ReactNode;
  title: string;
  identity: Omit<MeAuthData['oauthIdentities'][number], 'provider'>;
  /** The federation an institution's identity came through. */
  via?: string;
}

/** An OAuth or institution identity the account holds, named by the address its issuer asserted last. */
function IdentityTile({ value, icon, title, identity, via }: IdentityTileProps) {
  const { t } = useTranslation();

  return (
    <ExpandableTile
      {...{ value, icon, title }}
      meta={identity.email ?? t('c:connected_on', { date: dateShort(identity.createdAt) })}
      details={
        <>
          <ExpandableTileDetail label={t('c:connected')}>{dateShort(identity.createdAt)}</ExpandableTileDetail>
          <ExpandableTileDetail label={t('c:last_used')}>
            {identity.lastUsedAt ? dateShort(identity.lastUsedAt) : t('c:never_used')}
          </ExpandableTileDetail>
          {via && <ExpandableTileDetail label={t('c:via')}>{via}</ExpandableTileDetail>}
        </>
      }
    />
  );
}

export function AccountAuthenticationCard() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: authData } = useSuspenseQuery(meAuthQueryOptions());

  // An SSO recovery link names a connection (`connect`), offered beside the user's own institutions even before they join its organization.
  const { connect } = useSearch({ from: '/_app/account' });
  const listed = authData.institutions.find((institution) => institution.connectionId === connect);
  const { data: entry } = useQuery({ ...ssoEntryQueryOptions(connect), enabled: !!connect && !listed });
  const offered = entry?.status === 'active' ? { connectionId: entry.id, name: entry.institution.name, identity: null } : undefined;
  const institutions = offered ? [...authData.institutions, offered] : authData.institutions;
  const toConnect = [listed, offered].find((institution) => institution && !institution.identity);

  // A provider or connection id. State, so the spinner outlasts the mutation until the browser has left.
  const [connecting, setConnecting] = useState<string | null>(null);

  // The backend pins the next sign-in's callback to this account; the browser then leaves for that sign-in, which links the identity.
  const { mutate: startConnect } = useMutation({
    mutationFn: (_target: { id: string; url: string }) => withStepUp(() => startOAuthConnect()),
    onMutate: ({ id }) => setConnecting(id),
    onSuccess: (_data, { url }) => window.location.assign(url),
    onError: () => setConnecting(null),
  });

  const connectTo = (id: string, signInUrl: (search: { kind: 'connect'; redirectPath: string }) => string) => {
    if (!onlineManager.isOnline()) return toastOffline();
    startConnect({ id, url: signInUrl({ kind: 'connect', redirectPath: window.location.pathname + window.location.hash }) });
  };

  return (
    <ToolCard label="c:authentication" description={t('c:authentication.text')}>
      <Accordion className="text-sm *:last:mb-0">
        {isStrategyEnabled('passkey') && isStrategyEnabled('totp') && (
          <>
            <HelpText content={t('c:mfa.text')} className="mb-3">
              <h3 className="group-label">{t('c:mfa')}</h3>
              {!user.mfaRequired && (
                <Badge variant="success" soft className="max-sm:hidden">
                  {t('c:recommended')}
                </Badge>
              )}
            </HelpText>
            <MfaSwitch />
          </>
        )}

        {isStrategyEnabled('passkey') && <PasskeysList />}

        {isStrategyEnabled('totp') && (
          <>
            <HelpText content={t('c:totp.text')} className="mb-3">
              <h3 className="group-label">{t('c:totp')}</h3>
            </HelpText>
            <Totp />
          </>
        )}

        {isStrategyEnabled('oauth') && (
          <>
            <HelpText content={t('c:oauth.text')} className="mb-3">
              <h3 className="group-label">{t('c:oauth')}</h3>
            </HelpText>
            <div className="mb-8 flex flex-col gap-2">
              {enabledOAuthProviders.map(({ id, name }) => {
                const identity = authData.oauthIdentities.find(({ provider }) => provider === id);
                return identity ? (
                  <IdentityTile key={id} value={id} icon={<OAuthProviderIcon id={id} />} title={name} identity={identity} />
                ) : (
                  <Button
                    key={id}
                    variant="secondary"
                    className="sm:self-start"
                    loading={connecting === id}
                    onClick={() => connectTo(id, (search) => `${appConfig.backendAuthUrl}/${id}?${new URLSearchParams(search)}`)}
                  >
                    <OAuthProviderIcon id={id} />
                    {t('c:add_provider_account', { provider: name })}
                  </Button>
                );
              })}
            </div>
          </>
        )}

        {isStrategyEnabled('sso') && institutions.length > 0 && (
          <>
            <HelpText content={t('c:institution_accounts.text')} className="mb-3">
              <h3 className="group-label">{t('c:institution_accounts')}</h3>
            </HelpText>
            {toConnect && (
              <Alert variant="info" className="mb-3">
                <InfoIcon />
                <AlertDescription>{t('c:connect_institution_prompt.text', { institution: toConnect.name })}</AlertDescription>
              </Alert>
            )}
            <div className="mb-8 flex flex-col gap-2">
              {institutions.map((institution) => {
                const { connectionId, name, identity } = institution;
                return identity ? (
                  <IdentityTile
                    key={connectionId}
                    value={connectionId}
                    icon={<BuildingIcon />}
                    title={name}
                    identity={identity}
                    via={'federation' in institution ? institution.federation.name : undefined}
                  />
                ) : (
                  <Button
                    key={connectionId}
                    variant={connectionId === toConnect?.connectionId ? 'default' : 'secondary'}
                    className="max-w-full sm:self-start"
                    loading={connecting === connectionId}
                    onClick={() => connectTo(connectionId, (search) => ssoStartUrl({ connectionId }, search))}
                  >
                    <BuildingIcon />
                    <span className="truncate">{t('c:connect_institution', { institution: name })}</span>
                  </Button>
                );
              })}
            </div>
          </>
        )}
      </Accordion>
    </ToolCard>
  );
}
