import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { CheckIcon, TrashIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from 'sdk';
import { appConfig, type EnabledOAuthProvider } from 'shared';
import { mapOAuthProviders } from '~/modules/auth/oauth-providers';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { HelpText } from '~/modules/common/help-text';
import { PageAside } from '~/modules/common/page/aside';
import { SimpleHeader } from '~/modules/common/simple-header';
import { toaster } from '~/modules/common/toaster/toaster';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { DeleteSelf } from '~/modules/me/delete-self';
import { MfaSwitch } from '~/modules/me/mfa/switch';
import { PasskeysList } from '~/modules/me/passkeys/list';
import { meAuthQueryOptions } from '~/modules/me/query';
import { SessionsList } from '~/modules/me/sessions-list';
import { Totp } from '~/modules/me/totp';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import { useUIStore } from '~/modules/ui/ui-store';
import { UpdateUserForm } from '~/modules/user/update-user-form';
import { useUserStore } from '~/modules/user/user-store';

const tabs = [
  { id: 'general', label: 'c:general' },
  { id: 'sessions', label: 'c:sessions' },
  { id: 'authentication', label: 'c:authentication' },
  { id: 'delete-account', label: 'c:delete_account' },
];

const enabledStrategies = appConfig.enabledAuthStrategies;

function UserAccountPage() {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const mode = useUIStore((state) => state.mode);
  const { data: authData } = useSuspenseQuery(meAuthQueryOptions());
  const { enabledOAuth } = authData;

  const deleteButtonRef = useRef(null);

  const [loadingProvider, setLoadingProvider] = useState<EnabledOAuthProvider | null>(null);

  const invertClass = mode === 'dark' ? 'invert' : '';

  // Delete account
  const openDeleteDialog = () => {
    useDialoger.getState().create(
      <DeleteSelf
        dialog
        callback={({ status }: CallbackArgs<User>) => {
          if (status === 'success') toaster(t('c:success.delete_resource', { resource: t('c:account') }), 'success');
        }}
      />,
      {
        id: 'delete-account',
        triggerRef: deleteButtonRef,
        className: 'md:max-w-xl',
        title: t('c:delete_account'),
        description: t('c:confirm.delete_account', { email: user.email, appName: appConfig.name }),
      },
    );
  };

  const authenticateWithProvider = (provider: EnabledOAuthProvider) => {
    if (!onlineManager.isOnline()) return toaster(t('c:action.offline.text'), 'warning');

    // Proceed to OAuth URL with redirect and connect
    try {
      setLoadingProvider(provider);

      const baseUrl = `${appConfig.backendAuthUrl}/${provider}`;
      const params = new URLSearchParams({
        type: 'connect',
        redirectAfter: window.location.pathname + window.location.hash,
      });

      const providerUrl = `${baseUrl}?${params.toString()}`;
      window.location.assign(providerUrl);
    } catch (error) {
      console.error('Failed to build OAuth URL:', error);
      toaster(t('c:url_malformed'), 'error');
      setLoadingProvider(null);
    }
  };

  return (
    <div className="container my-4 gap-4 md:mt-8 md:flex md:flex-row">
      <div className="mx-auto max-md:hidden md:mt-3 md:w-[30%] md:min-w-48">
        <div className="max-md:block! group sticky top-3 z-10">
          <SimpleHeader className="p-3" heading="c:my_account" text="c:my_account.text" collapseText />
          <PageAside tabs={tabs} className="py-2" setFocus />
        </div>
      </div>

      <div className="flex flex-col gap-8 md:w-[70%]">
        <AsideAnchor id="general">
          <Card className="mx-auto sm:w-full" id="update-user">
            <CardHeader>
              <CardTitle>
                <UnsavedBadge title={t('c:general')} />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <UpdateUserForm user={user} />
            </CardContent>
          </Card>
        </AsideAnchor>

        <AsideAnchor id="sessions">
          <Card className="mx-auto sm:w-full">
            <CardHeader>
              <CardTitle>{t('c:sessions')}</CardTitle>
              <CardDescription>{t('c:sessions.text')}</CardDescription>
            </CardHeader>
            <CardContent>
              <SessionsList />
            </CardContent>
          </Card>
        </AsideAnchor>

        <AsideAnchor id="authentication">
          <Card className="mx-auto sm:w-full">
            <CardHeader>
              <CardTitle>{t('c:authentication')}</CardTitle>
              <CardDescription>{t('c:authentication.text')}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {
                /* MFA */
                enabledStrategies.includes('passkey') && enabledStrategies.includes('totp') && (
                  <>
                    <HelpText content={t('c:mfa.text')}>
                      <div className="flex items-center">
                        <p className="font-semibold">{t('c:mfa')}</p>
                        {!user.mfaRequired && (
                          <Badge
                            size="xs"
                            variant="outline"
                            className="ml-2 border-green-600 text-green-600 max-sm:hidden"
                          >
                            {t('c:recommended')}
                          </Badge>
                        )}
                      </div>
                    </HelpText>
                    <MfaSwitch />
                  </>
                )
              }
              {
                /* Passkeys */
                enabledStrategies.includes('passkey') && (
                  <>
                    <HelpText content={t('c:passkey.text')}>
                      <p className="font-semibold">{t('c:passkeys')}</p>
                    </HelpText>
                    <PasskeysList />
                  </>
                )
              }

              {
                /* TOTP */
                enabledStrategies.includes('totp') && (
                  <>
                    <HelpText content={t('c:totp.text')}>
                      <p className="font-semibold">{t('c:totp')}</p>
                    </HelpText>
                    <Totp />
                  </>
                )
              }

              {
                /* OAuth */
                enabledStrategies.includes('oauth') && (
                  <>
                    <HelpText content={t('c:oauth.text')}>
                      <p className="font-semibold">{t('c:oauth')}</p>
                    </HelpText>

                    <div className="mb-6 flex flex-col gap-3 sm:items-start">
                      {appConfig.enabledOAuthProviders.map((id) => {
                        const provider = mapOAuthProviders.find((provider) => provider.id === id);
                        if (!provider) return null;
                        if (enabledOAuth.includes(id)) {
                          return (
                            <div key={provider.id} className="flex items-center justify-center gap-2 px-3 py-2">
                              <img
                                src={`/static/images/${provider.id}-icon.svg`}
                                alt={provider.id}
                                className={`mr-2 size-4 ${provider.id === 'github' ? invertClass : ''}`}
                                loading="lazy"
                              />
                              <CheckIcon size={18} strokeWidth={3} className="text-success" />
                              {`${t('c:already_connected_to')} ${provider.name}`}
                            </div>
                          );
                        }
                        return (
                          // Assert is necessary because apps might not have all providers enabled
                          <Button
                            loading={loadingProvider === provider.id}
                            key={provider.id}
                            type="button"
                            variant="plain"
                            onClick={() => authenticateWithProvider(provider.id as EnabledOAuthProvider)}
                          >
                            <img
                              src={`/static/images/${provider.id}-icon.svg`}
                              alt={provider.id}
                              className={`mr-2 size-4 ${provider.id === 'github' ? invertClass : ''}`}
                              loading="lazy"
                            />
                            {`${t('c:add')} ${provider.name} ${t('c:account').toLowerCase()}`}
                          </Button>
                        );
                      })}
                    </div>
                  </>
                )
              }
            </CardContent>
          </Card>
        </AsideAnchor>

        <AsideAnchor id="delete-account">
          <Card className="mx-auto sm:w-full">
            <CardHeader>
              <CardTitle>{t('c:delete_account')}</CardTitle>
              <CardDescription>{t('c:delete_account.text', { appName: appConfig.name })}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                ref={deleteButtonRef}
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={openDeleteDialog}
              >
                <TrashIcon size={16} className="mr-2" />
                {t('c:delete_account')}
              </Button>
            </CardContent>
          </Card>
        </AsideAnchor>
      </div>
    </div>
  );
}

export default UserAccountPage;
