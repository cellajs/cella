import { Check, Trash2, Zap, ZapOff } from 'lucide-react';
import { SimpleHeader } from '~/modules/common/simple-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';

import { KeyRound, Send } from 'lucide-react';
import { deleteMySessions as baseTerminateMySessions } from '~/api/me';
import { dialog } from '~/modules/common/dialoger/state';
import { ExpandableList } from '~/modules/common/expandable-list';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';

import { config } from 'config';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getChallenge, sendResetPasswordEmail, setPasskey } from '~/api/auth';
import { useMutation } from '~/hooks/use-mutations';
import { arrayBufferToBase64Url, base64UrlDecode } from '~/lib/utils';
import { AsideNav } from '~/modules/common/aside-nav';
import StickyBox from '~/modules/common/sticky-box';
import UpdateUserForm from '~/modules/users/update-user-form';
import { useThemeStore } from '~/store/theme';
import { oauthProviders } from '../auth/oauth-options';
import { AsideAnchor } from '../common/aside-anchor';
import { Badge } from '../ui/badge';
import DeleteSelf from './delete-self';

export type Session = {
  id: string;
  type: string;
  current: boolean;
  impersonation: boolean;
};

const tabs = [
  { id: 'general', label: 'common:general' },
  { id: 'sessions', label: 'common:sessions' },
  { id: 'oauth', label: 'common:oauth' },
  { id: 'reset-password', label: 'common:reset_password' },
  { id: 'delete-account', label: 'common:delete_account' },
];

interface SessionTileProps {
  session: Session;
  deleteMySessions: (sessionIds: string[]) => void;
  isPending: boolean;
}

const SessionTile = ({ session, deleteMySessions, isPending }: SessionTileProps) => {
  const { t } = useTranslation();

  return (
    <div key={session.id} className="flex items-center py-2 px-3 gap-2 border rounded-md">
      <Zap size={16} />
      <div className="grow shrink truncate">
        <div className="font-semibold">
          {t('common:session')} {session.current && <Badge variant="secondary">current</Badge>}
        </div>
        <p className="font-light text-sm truncate">
          {session.type}
          <span className="mx-2 max-md:hidden">&#183;</span>
          <span className="opacity-50 max-md:hidden">{session.id}</span>
        </p>
      </div>
      {!session.current && (
        <Button
          variant="plain"
          size="sm"
          className="w-auto font-light text-sm"
          disabled={isPending}
          onClick={() => {
            deleteMySessions([session.id]);
          }}
        >
          <ZapOff size={14} className="mr-2" />
          {t('common:terminate')}
        </Button>
      )}
    </div>
  );
};

const UserSettings = () => {
  const { user } = useUserStore();
  const { mode } = useThemeStore();
  const { t } = useTranslation();

  const sessionsWithoutCurrent = useMemo(() => user.sessions.filter((session) => !session.current), [user.sessions]);
  const sessions = Array.from(user.sessions).sort((a) => (a.current ? -1 : 1));

  const { mutate: deleteMySessions, isPending } = useMutation({
    mutationFn: baseTerminateMySessions,
    onSuccess: (_, variables) => {
      useUserStore.setState((state) => {
        state.user.sessions = state.user.sessions.filter((session) => !variables.includes(session.id));
      });
      toast.success(variables.length === 1 ? t('common:success.session_terminated', { id: variables[0] }) : t('common:success.sessions_terminated'));
    },
  });

  const sendResetPasswordClick = () => {
    sendResetPasswordEmail(user.email);
    setDisabledResetPassword(true);
    setTimeout(() => {
      setDisabledResetPassword(false);
    }, 60000);
    toast.success(t('common:success.send_reset_password_email', { email: user.email }));
  };

  const openDeleteDialog = () => {
    dialog(
      <DeleteSelf
        dialog
        callback={() => {
          toast.success(t('common:success.delete_account'));
        }}
      />,
      {
        className: 'md:max-w-xl',
        title: t('common:delete_account'),
        text: t('common:confirm.delete_account', { email: user.email }),
      },
    );
  };

  async function registerPasskey() {
    const { challengeBase64 } = await getChallenge();

    const credential = await navigator.credentials.create({
      publicKey: {
        rp: {
          id: config.mode === 'development' ? 'localhost' : config.domain,
          name: config.name,
        },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.name,
          displayName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : 'No name provided',
        },
        challenge: base64UrlDecode(challengeBase64),
        pubKeyCredParams: [{ type: 'public-key', alg: -257 }],
        authenticatorSelection: { userVerification: 'required' },
        attestation: 'none',
      },
    });

    if (!(credential instanceof PublicKeyCredential)) throw new Error('Failed to create credential');
    const response = credential.response;
    if (!(response instanceof AuthenticatorAttestationResponse)) throw new Error('Unexpected response type');

    const credentialData = {
      email: user.email,
      attestationObject: arrayBufferToBase64Url(response.attestationObject),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
    };

    const result = await setPasskey(credentialData);
    if (result) toast.success('Passkey created successfully.');
    else toast.error('Creation of passkey failed.');
  }

  const [disabledResetPassword, setDisabledResetPassword] = useState(false);
  const invertClass = mode === 'dark' ? 'invert' : '';

  return (
    <div className="container md:flex md:flex-row my-4 md:my-8 mx-auto gap-4">
      <div className="max-md:hidden mx-auto md:min-w-48 md:w-[30%] md:mt-2">
        <StickyBox className="z-10 max-md:!block">
          <SimpleHeader className="p-3" heading="common:settings" text="common:settings.text" />
          <AsideNav tabs={tabs} className="py-2" />
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
                  onClick={() => {
                    deleteMySessions(sessionsWithoutCurrent.map((session) => session.id));
                  }}
                >
                  <ZapOff size={16} className="mr-2" />
                  {t('common:terminate_all')}
                </Button>
              )}
              <div className="flex flex-col mt-4 gap-2">
                <ExpandableList
                  items={sessions}
                  renderItem={(session) => (
                    <SessionTile session={session} key={session.id} deleteMySessions={deleteMySessions} isPending={isPending} />
                  )}
                  initialDisplayCount={3}
                  expandText="common:more_sessions"
                />
              </div>
            </CardContent>
          </Card>
        </AsideAnchor>

        <AsideAnchor id="passkey">
          <Card className="mx-auto sm:w-full">
            <div className="flex justify-between items-center ">
              <CardHeader>
                <CardTitle>{user.passkey ? t('common:already_have_passkey') : t('common:register_passkey')}</CardTitle>
                <CardDescription>{t('common:register_passkey_text')}</CardDescription>
              </CardHeader>
              {user.passkey && (
                <div className="flex items-center p-6">
                  <Check size={18} className="text-success" />
                </div>
              )}
            </div>
            <CardContent>
              <div className="flex flex-col justify-center gap-2">
                <Button key="passkey" type="button" variant="outline" onClick={() => registerPasskey()}>
                  <KeyRound className="w-4 h-4 mr-2" />
                  {user.passkey ? t('common:reset_passkey') : `${t('common:add')} ${t('common:new_passkey').toLowerCase()}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        </AsideAnchor>

        <AsideAnchor id="oauth">
          <Card className="mx-auto sm:w-full">
            <CardHeader>
              <CardTitle>{t('common:oauth')}</CardTitle>
              <CardDescription>{t('common:oauth.text')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {config.enabledOauthProviders.map((id) => {
                  const option = oauthProviders.find((provider) => provider.id === id);
                  if (!option) return;

                  return (
                    <Button
                      key={option.name}
                      type="button"
                      variant="outline"
                      onClick={() => {
                        window.location.href = `${option.url}?redirect=${window.location.href}`;
                      }}
                    >
                      <img
                        src={`/static/images/${option.name.toLowerCase()}-icon.svg`}
                        alt={option.name}
                        className={`w-4 h-4 mr-2 ${option.id === 'github' ? invertClass : ''}`}
                        loading="lazy"
                      />
                      {`${t('common:add')} ${option.name} ${t('common:account').toLowerCase()}`}
                    </Button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </AsideAnchor>

        <AsideAnchor id="reset-password">
          <Card className="mx-auto sm:w-full">
            <CardHeader>
              <CardTitle>{t('common:reset_password')}</CardTitle>
              <CardDescription>{t('common:reset_password.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full sm:w-auto" disabled={disabledResetPassword} onClick={sendResetPasswordClick}>
                <Send size={16} className="mr-2" />
                {t('common:send_reset_link')}
              </Button>
              {disabledResetPassword && <p className="text-sm text-gray-500 mt-2">{t('common:reset_password.retry_text')}</p>}
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

export default UserSettings;
