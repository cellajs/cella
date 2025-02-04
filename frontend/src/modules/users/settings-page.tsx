import { Check, KeyRound, Send, Trash2, ZapOff } from 'lucide-react';
import { SimpleHeader } from '~/modules/common/simple-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';

import { dialog } from '~/modules/common/dialoger/state';
import { ExpandableList } from '~/modules/common/expandable-list';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

import { onlineManager, useMutation } from '@tanstack/react-query';
import { config } from 'config';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { requestPasswordEmail } from '~/modules/auth/api';
import { mapOauthProviders } from '~/modules/auth/oauth-options';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import HelpText from '~/modules/common/help-text';
import { PageAside } from '~/modules/common/page-aside';
import StickyBox from '~/modules/common/sticky-box';
import { createToast } from '~/modules/common/toaster';
import DeleteSelf from '~/modules/users/delete-self';
import { deletePasskey, passkeyRegistration } from '~/modules/users/helpers';
import { SessionTile } from '~/modules/users/session-tile';
import UpdateUserForm from '~/modules/users/update-user-form';
import { useThemeStore } from '~/store/theme';
import { deleteMySessions } from './api';

const tabs = [
  { id: 'general', label: 'common:general' },
  { id: 'sessions', label: 'common:sessions' },
  { id: 'authentication', label: 'common:authentication' },
  { id: 'delete-account', label: 'common:delete_account' },
];

const UserSettingsPage = () => {
  const { user } = useUserStore();
  const { mode } = useThemeStore();
  const { t } = useTranslation();

  const sessionsWithoutCurrent = useMemo(() => user.sessions.filter((session) => !session.isCurrent), [user.sessions]);
  const sessions = Array.from(user.sessions).sort((a) => (a.isCurrent ? -1 : 1));

  const [disabledResetPassword, setDisabledResetPassword] = useState(false);
  const invertClass = mode === 'dark' ? 'invert' : '';

  // Terminate one or all sessions
  const { mutate: _deleteMySessions, isPending } = useMutation({
    mutationFn: deleteMySessions,
    onSuccess(_, variables) {
      useUserStore.setState((state) => {
        state.user.sessions = state.user.sessions.filter((session) => !variables.includes(session.id));
      });
      createToast(
        variables.length === 1 ? t('common:success.session_terminated', { id: variables[0] }) : t('common:success.sessions_terminated'),
        'success',
      );
    },
  });

  // Request a password reset email
  const requestResetPasswordClick = () => {
    if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');

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

  const onDeleteSession = (ids: string[]) => {
    if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');
    _deleteMySessions(ids);
  };

  const authenticateWithProvider = (provider: (typeof mapOauthProviders)[number]) => {
    if (!onlineManager.isOnline()) return createToast(t('common:action.offline.text'), 'warning');

    // Proceed to OAuth URL with redirect and connect=true
    window.location.href = `${provider.url}?connect=true&redirect=${encodeURIComponent(window.location.href)}`;
  };

  return (
    <div className="container md:flex md:flex-row my-4 md:mt-8 mx-auto gap-4 ">
      <div className="max-md:hidden mx-auto md:min-w-48 md:w-[30%] md:mt-2">
        <StickyBox className="z-10 max-md:!block">
          <SimpleHeader className="p-3" heading="common:settings" text="common:settings.text" />
          <PageAside tabs={tabs} className="py-2" />
        </StickyBox>
      </div>

      <div className="md:w-[70%] flex flex-col gap-8">
        <AsideAnchor id="general">
          <Card className="mx-auto sm:w-full">
            <CardHeader>
              <CardTitle>{t('common:general')}</CardTitle>
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
              {sessionsWithoutCurrent.length > 0 && (
                <Button
                  className="max-xs:w-full"
                  variant="plain"
                  size="sm"
                  disabled={isPending}
                  onClick={() => onDeleteSession(sessionsWithoutCurrent.map((session) => session.id))}
                >
                  <ZapOff size={16} className="mr-2" />
                  {t('common:terminate_all')}
                </Button>
              )}
              <div className="flex flex-col mt-4 gap-2">
                <ExpandableList
                  items={sessions}
                  renderItem={(session) => (
                    <SessionTile session={session} key={session.id} deleteMySessions={onDeleteSession} isPending={isPending} />
                  )}
                  initialDisplayCount={3}
                  expandText="common:more_sessions"
                />
              </div>
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

              {user.passkey && (
                <div className="flex items-center gap-2 mb-6">
                  <Check size={18} className="text-success" />
                  <span>{t('common:passkey_registered')}</span>
                </div>
              )}
              <div className="flex max-sm:flex-col gap-2 mb-6">
                <Button key="registerPasskey" type="button" variant="plain" onClick={passkeyRegistration}>
                  <KeyRound className="w-4 h-4 mr-2" />
                  {user.passkey ? t('common:reset_passkey') : `${t('common:add')} ${t('common:new_passkey').toLowerCase()}`}
                </Button>
                {user.passkey && (
                  <Button key="deletePasskey" type="button" variant="ghost" onClick={deletePasskey}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    <span>{t('common:remove')}</span>
                  </Button>
                )}
              </div>

              <HelpText content={t('common:oauth.text')}>
                <p className="font-semibold">{t('common:oauth')}</p>
              </HelpText>

              <div className="flex flex-col sm:items-start gap-2 mb-6">
                {config.enabledOauthProviders.map((id) => {
                  const provider = mapOauthProviders.find((provider) => provider.id === id);
                  if (!provider) return;
                  if (user.oauth.includes(id))
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
