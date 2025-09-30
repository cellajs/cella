import { onlineManager, useMutation } from '@tanstack/react-query';
import { appConfig, type EnabledOAuthProvider } from 'config';
import { Check, Send, Trash } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, type RequestPasswordData, type RequestPasswordResponse, requestPassword } from '~/api.gen';
import { mapOAuthProviders } from '~/modules/auth/oauth-providers';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import HelpText from '~/modules/common/help-text';
import { PageAside } from '~/modules/common/page/aside';
import { SimpleHeader } from '~/modules/common/simple-header';
import StickyBox from '~/modules/common/sticky-box';
import { toaster } from '~/modules/common/toaster/service';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import DeleteSelf from '~/modules/me/delete-self';
import { MfaSwitch } from '~/modules/me/mfa/switch';
import PasskeysList from '~/modules/me/passkeys/list';
import SessionsList from '~/modules/me/sessions';
import Totp from '~/modules/me/totp';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import UpdateUserForm from '~/modules/users/update-user-form';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

const tabs = [
  { id: 'general', label: 'common:general' },
  { id: 'sessions', label: 'common:sessions' },
  { id: 'authentication', label: 'common:authentication' },
  { id: 'delete-account', label: 'common:delete_account' },
];

const enabledStrategies = appConfig.enabledAuthStrategies;

const UserSettingsPage = () => {
  const { t } = useTranslation();
  const { user } = useUserStore();
  const mode = useUIStore((state) => state.mode);
  const { enabledOAuth } = useUserStore.getState();

  const deleteButtonRef = useRef(null);

  const [disabledResetPassword, setDisabledResetPassword] = useState(false);
  const invertClass = mode === 'dark' ? 'invert' : '';

  const { mutate: requestPasswordChange } = useMutation<RequestPasswordResponse, ApiError | Error, NonNullable<RequestPasswordData['body']>>({
    mutationFn: async (body) => await requestPassword({ body }),
    onSuccess: () => toaster(t('common:success.reset_password_email', { email: user.email }), 'success'),
    onSettled: () => setTimeout(() => setDisabledResetPassword(false), 60000),
  });

  // Request a password reset email
  const requestResetPasswordClick = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    setDisabledResetPassword(true);
    requestPasswordChange({ email: user.email });
  };

  // Delete account
  const openDeleteDialog = () => {
    useDialoger.getState().create(
      <DeleteSelf
        dialog
        callback={() => {
          toaster(t('common:success.delete_resource', { resource: t('common:account') }), 'success');
        }}
      />,
      {
        id: 'delete-account',
        triggerRef: deleteButtonRef,
        className: 'md:max-w-xl',
        title: t('common:delete_account'),
        description: t('common:confirm.delete_account', { email: user.email, appName: appConfig.name }),
      },
    );
  };

  const authenticateWithProvider = (provider: EnabledOAuthProvider) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    // Proceed to OAuth URL with redirect and connect
    // TODO show spinner/loading like in auth page?
    try {
      const baseUrl = `${appConfig.backendAuthUrl}/${provider}`;
      const params = new URLSearchParams({ type: 'connect', redirect: encodeURIComponent(window.location.pathname) });

      const providerUrl = `${baseUrl}?${params.toString()}`;
      window.location.assign(providerUrl);
    } catch (error) {
      toaster(t('common:url_malformed'), 'error');
    }
  };

  return (
    <div className="container md:flex md:flex-row my-4 md:mt-8 mx-auto gap-4 ">
      <div className="max-md:hidden mx-auto md:min-w-48 md:w-[30%] md:mt-3">
        <StickyBox className="z-10 max-md:block!">
          <SimpleHeader className="p-3" heading="common:settings" text="common:settings.text" />
          <PageAside tabs={tabs} className="py-2" setFocus />
        </StickyBox>
      </div>

      <div className="md:w-[70%] flex flex-col gap-8">
        <AsideAnchor id="general">
          <Card className="mx-auto sm:w-full" id="update-user">
            <CardHeader>
              <CardTitle>
                <UnsavedBadge title={t('common:general')} />
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
              <CardTitle>{t('common:sessions')}</CardTitle>
              <CardDescription>{t('common:sessions.text')}</CardDescription>
            </CardHeader>
            <CardContent>
              <SessionsList />
            </CardContent>
          </Card>
        </AsideAnchor>

        <AsideAnchor id="authentication">
          <Card className="mx-auto sm:w-full">
            <CardHeader>
              <CardTitle>{t('common:authentication')}</CardTitle>
              <CardDescription>{t('common:authentication.text')}</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              {
                /* MFA */
                enabledStrategies.includes('passkey') && enabledStrategies.includes('totp') && (
                  <>
                    <HelpText content={t('common:mfa.text')}>
                      <div className="flex">
                        <p className="font-semibold">{t('common:mfa')}</p>
                        {!user.mfaRequired && (
                          <Badge
                            size="xs"
                            variant="outline"
                            className="max-sm:hidden ml-2 uppercase text-[10px] font-normal text-green-600 border-green-600"
                          >
                            {t('common:recommended')}
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
                    <HelpText content={t('common:passkey.text')}>
                      <p className="font-semibold">{t('common:passkeys')}</p>
                    </HelpText>
                    <PasskeysList />
                  </>
                )
              }

              {
                /* TOTP */
                enabledStrategies.includes('totp') && (
                  <>
                    <HelpText content={t('common:totp.text')}>
                      <p className="font-semibold">{t('common:totp')}</p>
                    </HelpText>
                    <Totp />
                  </>
                )
              }

              {
                /* OAuth */
                enabledStrategies.includes('oauth') && (
                  <>
                    <HelpText content={t('common:oauth.text')}>
                      <p className="font-semibold">{t('common:oauth')}</p>
                    </HelpText>

                    <div className="flex flex-col sm:items-start gap-3 mb-6">
                      {appConfig.enabledOAuthProviders.map((id) => {
                        const provider = mapOAuthProviders.find((provider) => provider.id === id);
                        if (!provider) return null;
                        if (enabledOAuth.includes(id)) {
                          return (
                            <div key={provider.id} className="flex items-center justify-center px-3 py-2 gap-2">
                              <img
                                src={`/static/images/${provider.id}-icon.svg`}
                                alt={provider.id}
                                className={`w-4 h-4 mr-2 ${provider.id === 'github' ? invertClass : ''}`}
                                loading="lazy"
                              />
                              <Check size={18} strokeWidth={3} className="text-success" />
                              {`${t('common:already_connected_to')} ${provider.name}`}
                            </div>
                          );
                        }
                        return (
                          // Assert is necessary because apps might not have all providers enabled
                          <Button
                            key={provider.id}
                            type="button"
                            variant="plain"
                            onClick={() => authenticateWithProvider(provider.id as EnabledOAuthProvider)}
                          >
                            <img
                              src={`/static/images/${provider.id}-icon.svg`}
                              alt={provider.id}
                              className={`w-4 h-4 mr-2 ${provider.id === 'github' ? invertClass : ''}`}
                              loading="lazy"
                            />
                            {`${t('common:add')} ${provider.name} ${t('common:account').toLowerCase()}`}
                          </Button>
                        );
                      })}
                    </div>
                  </>
                )
              }

              {
                /* Password reset */
                enabledStrategies.includes('password') && (
                  <>
                    <HelpText content={t('common:request_password.text')}>
                      <p className="font-semibold">{t('common:reset_resource', { resource: t('common:password').toLowerCase() })}</p>{' '}
                    </HelpText>
                    <div className="mb-6">
                      <Button className="w-full sm:w-auto" variant="plain" disabled={disabledResetPassword} onClick={requestResetPasswordClick}>
                        <Send size={16} className="mr-2" />
                        {t('common:send_reset_link')}
                      </Button>
                      {disabledResetPassword && <p className="text-sm text-gray-500 mt-2">{t('common:retry_reset_password.text')}</p>}
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
              <CardTitle>{t('common:delete_account')}</CardTitle>
              <CardDescription>{t('common:delete_account.text', { appName: appConfig.name })}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button ref={deleteButtonRef} variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
                <Trash size={16} className="mr-2" />
                {t('common:delete_account')}
              </Button>
            </CardContent>
          </Card>
        </AsideAnchor>
      </div>
    </div>
  );
};

export default UserSettingsPage;
