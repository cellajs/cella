import { onlineManager, useMutation, useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { BuildingIcon, TrashIcon } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { startOAuthConnect } from 'sdk';
import { appConfig, isStrategyEnabled } from 'shared';
import { enabledOAuthProviders, OAuthProviderIcon } from '~/modules/auth/oauth-providers';
import { ssoEntryQueryOptions } from '~/modules/auth/query';
import { ssoStartUrl } from '~/modules/auth/sso-providers';
import { withStepUp } from '~/modules/auth/step-up';
import { ConfirmText } from '~/modules/common/confirm-text';
import { dialoger } from '~/modules/common/dialoger/use-dialoger';
import { HelpText } from '~/modules/common/help-text';
import { toastOffline } from '~/modules/common/toaster/toaster';
import { ToolCard } from '~/modules/common/tool-card';
import { ConnectedAppsList } from '~/modules/me/connected-apps-list';
import { ConnectedStatus } from '~/modules/me/connected-status';
import { DeleteSelf } from '~/modules/me/delete-self';
import { MfaSwitch } from '~/modules/me/mfa/switch';
import { PasskeysList } from '~/modules/me/passkeys/list';
import { meAuthQueryOptions } from '~/modules/me/query';
import { SessionsList } from '~/modules/me/sessions-list';
import { Totp } from '~/modules/me/totp';
import { Alert, AlertDescription } from '~/modules/ui/alert';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { UpdateUserForm } from '~/modules/user/update-user-form';
import { useCurrentUser } from '~/modules/user/user-store';

export function AccountGeneralCard() {
  const user = useCurrentUser();

  return (
    <ToolCard label="c:general" unsaved id="update-user">
      <UpdateUserForm user={user} />
    </ToolCard>
  );
}

export function AccountSessionsCard() {
  const { t } = useTranslation();

  return (
    <ToolCard label="c:sessions" description={t('c:sessions.text')}>
      <SessionsList />
    </ToolCard>
  );
}

export function AccountConnectedAppsCard() {
  const { t } = useTranslation();

  return (
    <ToolCard label="c:connected_apps" description={t('c:connected_apps.text')}>
      <ConnectedAppsList />
    </ToolCard>
  );
}

interface AuthSectionTitleProps {
  title: string;
  help: string;
  /** Follows the title, before the help toggle. */
  children?: ReactNode;
}

function AuthSectionTitle({ title, help, children }: AuthSectionTitleProps) {
  return (
    <HelpText content={help}>
      <h3 className="font-semibold">{title}</h3>
      {children}
    </HelpText>
  );
}

export function AccountAuthenticationCard() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const { data: authData } = useSuspenseQuery(meAuthQueryOptions());
  const { enabledOAuth } = authData;

  // An SSO recovery link names a connection (`connect`), offered beside the user's own institutions even before they join its organization.
  const { connect } = useSearch({ from: '/_app/account' });
  const listed = authData.institutions.find((institution) => institution.connectionId === connect);
  const { data: entry } = useQuery({ ...ssoEntryQueryOptions(connect), enabled: !!connect && !listed });
  const offered = entry?.status === 'active' ? { connectionId: entry.id, displayName: entry.institution.displayName, connected: false } : undefined;
  const institutions = offered ? [...authData.institutions, offered] : authData.institutions;
  const toConnect = [listed, offered].find((institution) => institution && !institution.connected);

  // A provider or connection id. State, so the spinner outlasts the mutation until the browser has left.
  const [connecting, setConnecting] = useState<string | null>(null);

  // The backend pins the next sign-in's callback to this account; the browser then leaves for that sign-in, which links the identity.
  const { mutate: startConnect } = useMutation({
    mutationFn: (_target: { id: string; url: string }) => withStepUp(() => startOAuthConnect()),
    onMutate: ({ id }) => setConnecting(id),
    onSuccess: (_data, { url }) => window.location.assign(url),
    onError: () => setConnecting(null),
  });

  const connectTo = (id: string, signInUrl: (search: { type: 'connect'; redirectAfter: string }) => string) => {
    if (!onlineManager.isOnline()) return toastOffline();
    startConnect({ id, url: signInUrl({ type: 'connect', redirectAfter: window.location.pathname + window.location.hash }) });
  };

  return (
    <ToolCard label="c:authentication" description={t('c:authentication.text')}>
      <div className="text-sm">
        {isStrategyEnabled('passkey') && isStrategyEnabled('totp') && (
          <>
            <AuthSectionTitle title={t('c:mfa')} help={t('c:mfa.text')}>
              {!user.mfaRequired && (
                <Badge variant="success" soft className="max-sm:hidden">
                  {t('c:recommended')}
                </Badge>
              )}
            </AuthSectionTitle>
            <MfaSwitch />
          </>
        )}

        {isStrategyEnabled('passkey') && (
          <>
            <AuthSectionTitle title={t('c:passkeys')} help={t('c:passkey.text')} />
            <PasskeysList />
          </>
        )}

        {isStrategyEnabled('totp') && (
          <>
            <AuthSectionTitle title={t('c:totp')} help={t('c:totp.text')} />
            <Totp />
          </>
        )}

        {isStrategyEnabled('oauth') && (
          <>
            <AuthSectionTitle title={t('c:oauth')} help={t('c:oauth.text')} />
            <div className="mb-6 flex flex-col gap-3 sm:items-start">
              {enabledOAuthProviders.map(({ id, name }) =>
                enabledOAuth.includes(id) ? (
                  <ConnectedStatus key={id} icon={<OAuthProviderIcon id={id} />}>
                    {t('c:connected_to_provider', { provider: name })}
                  </ConnectedStatus>
                ) : (
                  <Button
                    key={id}
                    variant="plain"
                    loading={connecting === id}
                    onClick={() => connectTo(id, (search) => `${appConfig.backendAuthUrl}/${id}?${new URLSearchParams(search)}`)}
                  >
                    <OAuthProviderIcon id={id} />
                    {t('c:add_provider_account', { provider: name })}
                  </Button>
                ),
              )}
            </div>
          </>
        )}

        {isStrategyEnabled('sso') && institutions.length > 0 && (
          <>
            <AuthSectionTitle title={t('c:institution_accounts')} help={t('c:institution_accounts.text')} />
            {toConnect && (
              <Alert className="mb-3">
                <AlertDescription>{t('c:connect_institution_prompt.text', { institution: toConnect.displayName })}</AlertDescription>
              </Alert>
            )}
            <div className="mb-6 flex flex-col gap-3 sm:items-start">
              {institutions.map(({ connectionId, displayName, connected }) =>
                connected ? (
                  <ConnectedStatus key={connectionId} icon={<BuildingIcon />}>
                    {t('c:connected_to_institution', { institution: displayName })}
                  </ConnectedStatus>
                ) : (
                  <Button
                    key={connectionId}
                    variant={connectionId === toConnect?.connectionId ? 'default' : 'plain'}
                    loading={connecting === connectionId}
                    onClick={() => connectTo(connectionId, (search) => ssoStartUrl({ connectionId }, search))}
                  >
                    <BuildingIcon />
                    {t('c:connect_institution', { institution: displayName })}
                  </Button>
                ),
              )}
            </div>
          </>
        )}
      </div>
    </ToolCard>
  );
}

export function AccountDeleteCard() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  const openDeleteDialog = () => {
    dialoger.getState().create(<DeleteSelf />, {
      id: 'delete-account',
      triggerRef: deleteButtonRef,
      className: 'md:max-w-xl',
      title: t('c:delete_account'),
      description: <ConfirmText i18nKey="c:confirm.delete_account" values={{ email: user.email, appName: appConfig.name }} />,
    });
  };

  return (
    <ToolCard label="c:delete_account" description={t('c:delete_account.text', { appName: appConfig.name })}>
      <Button ref={deleteButtonRef} variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
        <TrashIcon />
        {t('c:delete_account')}
      </Button>
    </ToolCard>
  );
}
