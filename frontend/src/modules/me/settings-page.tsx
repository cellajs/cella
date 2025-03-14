import { Check, Send, Trash2 } from 'lucide-react';
import { SimpleHeader } from '~/modules/common/simple-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';

import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

import { onlineManager } from '@tanstack/react-query';
import { useLoaderData } from '@tanstack/react-router';
import { config } from 'config';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { requestPasswordEmail } from '~/modules/auth/api';
import { mapOauthProviders } from '~/modules/auth/oauth-options';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import HelpText from '~/modules/common/help-text';
import { PageAside } from '~/modules/common/page/aside';
import StickyBox from '~/modules/common/sticky-box';
import { toaster } from '~/modules/common/toaster';
import DeleteSelf from '~/modules/me/delete-self';
import Passkeys from '~/modules/me/passkeys';
import SessionsList from '~/modules/me/sessions-list';
import UpdateUserForm from '~/modules/users/update-user-form';
import { UserSettingsRoute } from '~/routes/users';
import { useUIStore } from '~/store/ui';
import UnsavedBadge from '../common/unsaved-badge';

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

  // Get user auth info from route
  const userAuthInfo = useLoaderData({ from: UserSettingsRoute.id });

  const [disabledResetPassword, setDisabledResetPassword] = useState(false);
  const invertClass = mode === 'dark' ? 'invert' : '';

  // Request a password reset email
  const requestResetPasswordClick = () => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    try {
      setDisabledResetPassword(true);
      requestPasswordEmail(user.email);
      toast.success(t('common:success.reset_password_email', { email: user.email }));
    } catch {
    } finally {
      setTimeout(() => {
        setDisabledResetPassword(false);
      }, 60000);
    }
  };

  // Delete account
  const openDeleteDialog = () => {
    dialog(
      <DeleteSelf
        dialog
        callback={() => {
          toast.success(t('common:success.delete_resource', { resource: t('common:account') }));
        }}
      />,
      {
        className: 'md:max-w-xl',
        title: t('common:delete_account'),
        description: t('common:confirm.delete_account', { email: user.email }),
      },
    );
  };

  const authenticateWithProvider = (provider: (typeof mapOauthProviders)[number]) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    // Proceed to OAuth URL with redirect and connect
    window.location.href = `${provider.url}?connect=${user.id}&redirect=${encodeURIComponent(window.location.href)}`;
  };

  return (
    <div className="container md:flex md:flex-row my-4 md:mt-8 mx-auto gap-4 ">
      <div className="max-md:hidden mx-auto md:min-w-48 md:w-[30%] md:mt-3">
        <StickyBox className="z-10 max-md:block!">
          <SimpleHeader className="p-3" heading="common:settings" text="common:settings.text" />
          <PageAside tabs={tabs} className="py-2" />
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

              <div className="flex flex-col sm:items-start gap-2 mb-6">
                {config.enabledOauthProviders.map((id) => {
                  const provider = mapOauthProviders.find((provider) => provider.id === id);
                  if (!provider) return;
                  if (userAuthInfo.oauth.includes(id))
                    return (
                      <div key={provider.id} className="flex items-center justify-center py-2 px-3 gap-2 border rounded-md">
                        <img
                          src={`/static/images/${provider.id}-icon.svg`}
                          alt={provider.id}
                          className={`w-4 h-4 ${provider.id === 'github' ? invertClass : ''}`}
                          loading="lazy"
                        />
                        <Check size={18} className="text-success" />
                        {`${t('common:already_connected_to')} ${provider.name}`}
                      </div>
                    );
                  return (
                    <Button key={provider.id} type="button" variant="outline" onClick={() => authenticateWithProvider(provider)}>
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
              <CardDescription>{t('common:delete_account.text', { appName: config.name })}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" className="w-full sm:w-auto" onClick={openDeleteDialog}>
                <Trash2 className="mr-2 h-4 w-4" />
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
