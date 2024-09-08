import { Check, KeyRound, Monitor, Send, Smartphone, Trash2, ZapOff } from 'lucide-react';
import { SimpleHeader } from '~/modules/common/simple-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/modules/ui/card';

import { deletePasskey as baseRemovePasskey, deleteMySessions as baseTerminateMySessions } from '~/api/me';
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
import { arrayBufferToBase64Url, base64UrlDecode, dateShort } from '~/lib/utils';
import { oauthProviders } from '~/modules/auth/oauth-options';
import { AsideAnchor } from '~/modules/common/aside-anchor';
import { AsideNav } from '~/modules/common/aside-nav';
import StickyBox from '~/modules/common/sticky-box';
import { Badge } from '~/modules/ui/badge';
import DeleteSelf from '~/modules/users/delete-self';
import UpdateUserForm from '~/modules/users/update-user-form';
import { useThemeStore } from '~/store/theme';
import type { Session } from '~/types/common';
import HelpText from '../common/help-text';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';

const tabs = [
  { id: 'general', label: 'common:general' },
  { id: 'sessions', label: 'common:sessions' },
  { id: 'authentication', label: 'common:authentication' },
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
    <div className="flex items-center w-full gap-3 min-h-[40px] p-3">
      {session.deviceType === 'desktop' ? <Monitor size={24} /> : <Smartphone size={24} />}
      <div className="text-start">
        <div className="font-semibold">{session.deviceName || t('common:unknown_device')}</div>
        <p className="font-light text-sm truncate">
          <span className="opacity-50 max-md:hidden">{session.deviceOs}</span>
        </p>
      </div>
      {session.isCurrent && (
        <Badge variant="plain" className="uppercase text-[10px] py-0">
          current
        </Badge>
      )}
      {!session.isCurrent && (
        <Button
          variant="destructive"
          size="sm"
          className="text-sm ml-auto hidden group-hover:block"
          disabled={isPending}
          onClick={() => {
            deleteMySessions([session.id]);
          }}
        >
          {t('common:terminate')}
        </Button>
      )}
    </div>
  );
};

const UserSettingsPage = () => {
  const { user, setUser } = useUserStore();
  const { mode } = useThemeStore();
  const { t } = useTranslation();

  const sessionsWithoutCurrent = useMemo(() => user.sessions.filter((session) => !session.isCurrent), [user.sessions]);
  const sessions = Array.from(user.sessions).sort((a) => (a.isCurrent ? -1 : 1));

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
    toast.success(t('common:success.reset_password_email', { email: user.email }));
  };

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
        text: t('common:confirm.delete_account', { email: user.email }),
      },
    );
  };
  const deletePasskey = async () => {
    const result = await baseRemovePasskey();
    if (result) {
      toast.success(t('common:success.passkey_removed'));
      setUser({ ...user, passkey: false });
    } else toast.error(t('common:error.passkey_remove_failed'));
  };

  const registerPasskey = async () => {
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
          displayName: user.firstName || user.name || 'No name provided',
        },
        challenge: base64UrlDecode(challengeBase64),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 }, // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
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
    if (result) {
      toast.success(t('common:success.passkey_added'));
      setUser({ ...user, passkey: true });
    } else toast.error(t('common:error.passkey_add_failed'));
  };

  const [disabledResetPassword, setDisabledResetPassword] = useState(false);
  const invertClass = mode === 'dark' ? 'invert' : '';

  return (
    <div className="container md:flex md:flex-row mt-4 md:mt-8 mx-auto gap-4 mb-[50vh]">
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
                <Accordion type="single" collapsible className="space-y-1">
                  <ExpandableList
                    items={sessions}
                    renderItem={(session) => (
                      <AccordionItem value={session.id} className="border group rounded-md">
                        <AccordionTrigger className="hover:no-underline p-0 pr-3">
                          <SessionTile session={session} key={session.id} deleteMySessions={deleteMySessions} isPending={isPending} />
                        </AccordionTrigger>
                        <AccordionContent className="p-3 pt-0">
                          {session.browser && (
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">{t('common:browser')}</p>
                              <p className="text-sm">{session.browser}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{t('common:auth_strategy')}</p>
                            <p className="text-sm">{session.authStrategy}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{t('common:created_at')}</p>
                            <p className="text-sm">{dateShort(session.createdAt)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{t('common:expires_at')}</p>
                            <p className="text-sm">{dateShort(session.expiresAt)}</p>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    )}
                    initialDisplayCount={3}
                    expandText="common:more_sessions"
                  />
                </Accordion>
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
                <Button key="setPasskey" type="button" variant="plain" onClick={() => registerPasskey()}>
                  <KeyRound className="w-4 h-4 mr-2" />
                  {user.passkey ? t('common:reset_passkey') : `${t('common:add')} ${t('common:new_passkey').toLowerCase()}`}
                </Button>
                {user.passkey && (
                  <Button key="deletePasskey" type="button" variant="ghost" onClick={() => deletePasskey()}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    <span>{t('common:remove')}</span>
                  </Button>
                )}
              </div>

              <HelpText content={t('common:oauth.text')}>
                <p className="font-semibold">{t('common:oauth')}</p>
              </HelpText>

              <div className="flex max-sm:flex-col gap-2 mb-6">
                {config.enabledOauthProviders.map((id) => {
                  const option = oauthProviders.find((provider) => provider.id === id);
                  if (!option) return;
                  if (user.oauth.includes(id))
                    return (
                      <div key={option.name} className="flex items-center justify-center py-2 px-3 gap-2 border rounded-md">
                        <img
                          src={`/static/images/${option.name.toLowerCase()}-icon.svg`}
                          alt={option.name}
                          className={`w-4 h-4 ${option.id === 'github' ? invertClass : ''}`}
                          loading="lazy"
                        />
                        {`${t('common:already_connected_to')} ${option.name} `}
                      </div>
                    );
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

              <HelpText content={t('common:reset_password_email.text')}>
                <p className="font-semibold">{t('common:reset_password')}</p>{' '}
              </HelpText>
              <div>
                <Button className="w-full sm:w-auto" variant="outline" disabled={disabledResetPassword} onClick={sendResetPasswordClick}>
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
