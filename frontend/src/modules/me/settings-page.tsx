import { onlineManager } from '@tanstack/react-query';
import { useLoaderData } from '@tanstack/react-router';
import { appConfig, type EnabledOAuthProvider } from 'config';
import { Check, Send, Trash } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { requestPassword } from '~/api.gen';
import { mapOAuthProviders } from '~/modules/auth/oauth-options';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import HelpText from '~/modules/common/help-text';
import { PageAside } from '~/modules/common/page/aside';
import { SimpleHeader } from '~/modules/common/simple-header';
import StickyBox from '~/modules/common/sticky-box';
import { toaster } from '~/modules/common/toaster';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import DeleteSelf from '~/modules/me/delete-self';
import Passkeys from '~/modules/me/passkeys';
import SessionsList from '~/modules/me/sessions-list';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';
import UpdateUserForm from '~/modules/users/update-user-form';
import { UserSettingsRoute } from '~/routes/users';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

const tabs = [
  { id: 'general', label: 'common:general' },
  { id: 'sessions', label: 'common:sessions' },
  { id: 'authentication', label: 'common:authentication' },
  { id: 'delete-account', label: 'common:delete_account' },
];

const UserSettingsPage = () => {
  const { user } = useUserStore();
  const mode = useUIStore((state) => state.mode);
  const { t } = useTranslation();

  const deleteButtonRef = useRef(null);

  // Get user auth info from route
  const userAuthInfo = useLoaderData({ from: UserSettingsRoute.id });

  const [disabledResetPassword, setDisabledResetPassword] = useState(false);
  const invertClass = mode === 'dark' ? 'invert' : '';

  // Request a password reset email
  // TODO: use a mutation hook for this? Then we also have better error handling?
  const requestResetPasswordClick = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    try {
      setDisabledResetPassword(true);
      requestPassword({ body: { email: user.email } });
      toast.success(t('common:success.reset_password_email', { email: user.email }));
    } catch {
    } finally {
      setTimeout(() => setDisabledResetPassword(false), 60000);
    }
  };

  // Delete account
  const openDeleteDialog = () => {
    useDialoger.getState().create(
      <DeleteSelf
        dialog
        callback={() => {
          toast.success(t('common:success.delete_resource', { resource: t('common:account') }));
        }}
      />,
      {
        id: 'delete-account',
        triggerRef: deleteButtonRef,
        className: 'md:max-w-xl',
        title: t('common:delete_account'),
        description: t('common:confirm.delete_account', { email: user.email }),
      },
    );
  };

  const authenticateWithProvider = (provider: EnabledOAuthProvider) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    // Proceed to OAuth URL with redirect and connect
    try {
      const baseUrl = `${appConfig.backendAuthUrl}/${provider}`;
      const params = new URLSearchParams({ connect: user.id, type: 'connect', redirect: encodeURIComponent(window.location.pathname) });

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
              <SessionsList userAuthInfo={userAuthInfo} />
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
              <HelpText content={t('common:passkey.text')}>
                <p className="font-semibold">{t('common:passkey')}</p>
              </HelpText>

              <Passkeys userAuthInfo={userAuthInfo} />

              <HelpText content={t('common:oauth.text')}>
                <p className="font-semibold">{t('common:oauth')}</p>
              </HelpText>

              <div className="flex flex-col sm:items-start gap-3 mb-6">
                {appConfig.enabledOAuthProviders.map((id) => {
                  const provider = mapOAuthProviders.find((provider) => provider.id === id);
                  if (!provider) return;
                  if (userAuthInfo.oauth.includes(id))
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

              <HelpText content={t('common:request_password.text')}>
                <p className="font-semibold">{t('common:reset_password')}</p>{' '}
              </HelpText>
              <div>
                <Button className="w-full sm:w-auto" variant="outline" disabled={disabledResetPassword} onClick={requestResetPasswordClick}>
                  <Send size={16} className="mr-2" />
                  {t('common:send_reset_link')}
                </Button>
                {disabledResetPassword && <p className="text-sm text-gray-500 mt-2">{t('common:retry_reset_password.text')}</p>}
              </div>
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
