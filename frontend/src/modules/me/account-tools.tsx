import { onlineManager, useSuspenseQuery } from '@tanstack/react-query';
import { CheckIcon, TrashIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { User } from 'sdk';
import { appConfig, type EnabledOAuthProvider } from 'shared';
import { mapOAuthProviders } from '~/modules/auth/oauth-providers';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { HelpText } from '~/modules/common/help-text';
import { toaster } from '~/modules/common/toaster/toaster';
import { ToolCard } from '~/modules/common/tool-card';
import { DeleteSelf } from '~/modules/me/delete-self';
import { MfaSwitch } from '~/modules/me/mfa/switch';
import { PasskeysList } from '~/modules/me/passkeys/list';
import { meAuthQueryOptions } from '~/modules/me/query';
import { SessionsList } from '~/modules/me/sessions-list';
import { Totp } from '~/modules/me/totp';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/modules/ui/ui-store';
import { UpdateUserForm } from '~/modules/user/update-user-form';
import { useCurrentUser } from '~/modules/user/user-store';

const enabledStrategies = appConfig.enabledAuthStrategies;

const cardClass = 'mx-auto sm:w-full';

export function AccountGeneralCard() {
  const user = useCurrentUser();

  return (
    <ToolCard label="c:general" unsaved id="update-user" className={cardClass}>
      <UpdateUserForm user={user} />
    </ToolCard>
  );
}

export function AccountSessionsCard() {
  const { t } = useTranslation();

  return (
    <ToolCard label="c:sessions" description={t('c:sessions.text')} className={cardClass}>
      <SessionsList />
    </ToolCard>
  );
}

export function AccountAuthenticationCard() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const mode = useUIStore((state) => state.mode);
  const { data: authData } = useSuspenseQuery(meAuthQueryOptions());
  const { enabledOAuth } = authData;

  const [loadingProvider, setLoadingProvider] = useState<EnabledOAuthProvider | null>(null);

  const invertClass = mode === 'dark' ? 'invert' : '';

  const authenticateWithProvider = (provider: EnabledOAuthProvider) => {
    if (!onlineManager.isOnline()) return toaster.warning(t('c:action.offline.text'));

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
      toaster.error(t('c:url_malformed'));
      setLoadingProvider(null);
    }
  };

  return (
    <ToolCard label="c:authentication" description={t('c:authentication.text')} className={cardClass}>
      <div className="text-sm">
        {
          /* MFA */
          enabledStrategies.includes('passkey') && enabledStrategies.includes('totp') && (
            <>
              <HelpText content={t('c:mfa.text')}>
                <div className="flex items-center">
                  <p className="font-semibold">{t('c:mfa')}</p>
                  {!user.mfaRequired && (
                    <Badge size="xs" variant="outline" className="ml-2 border-green-600 text-green-600 max-sm:hidden">
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
                          src={`/static/auth/${provider.id}-icon.svg`}
                          alt={provider.id}
                          className={`mr-2 size-4 ${provider.id === 'github' ? invertClass : ''}`}
                          loading="lazy"
                        />
                        <CheckIcon strokeWidth={3} className="size-4.5 text-success" />
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
                        src={`/static/auth/${provider.id}-icon.svg`}
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
      </div>
    </ToolCard>
  );
}

export function AccountDeleteCard() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const deleteButtonRef = useRef(null);

  const openDeleteDialog = () => {
    useDialoger.getState().create(
      <DeleteSelf
        dialog
        callback={({ status }: CallbackArgs<User>) => {
          if (status === 'success') toaster.success(t('c:success.delete_resource', { resource: t('c:account') }));
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

  return (
    <ToolCard
      label="c:delete_account"
      description={t('c:delete_account.text', { appName: appConfig.name })}
      className={cardClass}
    >
      <Button ref={deleteButtonRef} variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
        <TrashIcon className="mr-2" />
        {t('c:delete_account')}
      </Button>
    </ToolCard>
  );
}
