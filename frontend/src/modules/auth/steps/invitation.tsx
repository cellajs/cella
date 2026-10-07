import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { MailIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type GetAuthHealthResponse, sendMagicLink } from 'sdk';
import { appConfig, isStrategyEnabled } from 'shared';
import { useShallow } from 'zustand/react/shallow';
import { AuthDivider } from '~/modules/auth/auth-divider';
import { useAuthStore } from '~/modules/auth/auth-store';
import { LegalNotice } from '~/modules/auth/legal-notice';
import { OAuthProviders } from '~/modules/auth/oauth-providers';
import { SsoProviders, ssoEntryQueryOptions } from '~/modules/auth/sso-providers';
import type { TokenData } from '~/modules/auth/types';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';

const emailEnabled = isStrategyEnabled('passkey');
const isMagicLinkEnabled = isStrategyEnabled('magic');

interface Props {
  tokenData: TokenData;
  federations?: GetAuthHealthResponse['federations'];
}

/**
 * Landing step for a signed-out visitor holding an invitation: who invited them to what, and the ways in. The emailed
 * link goes to the invited address, where it signs in or creates the account. The institution of the invited
 * organization comes first when it has one. A membership invitation can also be answered with an account on another
 * address: the visitor signs in first and the confirm step follows.
 */
export function InvitationStep({ tokenData, federations }: Props) {
  const { t } = useTranslation();
  const { setStep, setMagicLinkMode, setInviteOtherAccount } = useAuthStore(
    useShallow((state) => ({
      setStep: state.setStep,
      setMagicLinkMode: state.setMagicLinkMode,
      setInviteOtherAccount: state.setInviteOtherAccount,
    })),
  );
  const { redirect } = useSearch({ from: '/_public/auth/authenticate' });

  const { email, invitation, ssoConnectionId } = tokenData;

  // Shared with the institution button, so the order of the ways in is settled before anything shows.
  const { data: entry, isLoading: isEntryLoading } = useQuery({ ...ssoEntryQueryOptions(ssoConnectionId ?? ''), enabled: !!ssoConnectionId });
  const institutionFirst = entry?.status === 'active';

  const { mutate: sendLink, isPending } = useMutation({
    mutationFn: () => sendMagicLink({ body: { email, redirect } }),
    onSuccess: () => {
      // An account may hold the invited address by now: the link then signs in.
      setMagicLinkMode(tokenData.userId ? 'signin' : 'signup');
      setStep('magicLinkSent', email);
    },
    onError: () => toaster.error(t('error:reported_try_later')),
  });

  if (isEntryLoading) return <Spinner className="size-10" />;

  const emailWay = (emailEnabled || isMagicLinkEnabled) && (
    <>
      <SubmitButton
        variant={institutionFirst ? 'plain' : 'default'}
        loading={isPending}
        icon={<MailIcon />}
        className="w-full"
        onClick={() => sendLink()}
      >
        {t('c:continue_with_email')}
      </SubmitButton>
      <p className="-mt-2 text-center text-muted-foreground text-sm">{t('c:magic_link_goes_to.text', { email })}</p>
    </>
  );

  return (
    <>
      {invitation && <EntityAvatar type={invitation.entityType} name={invitation.entityName} className="mx-auto size-14" />}
      <h1 className="text-center text-2xl">{t('c:invite_join', { name: invitation?.entityName ?? appConfig.name })}</h1>
      {invitation && (
        <p className="text-center font-light">
          {t('c:invite_join.text', { inviterName: invitation.inviterName, role: t(`c:${invitation.role}`).toLowerCase() })}
        </p>
      )}

      {institutionFirst ? (
        <>
          <SsoProviders connectionId={ssoConnectionId} federations={federations} primary />
          <AuthDivider />
          {emailWay}
        </>
      ) : (
        <>
          {emailWay}
          <AuthDivider />
          {isStrategyEnabled('sso') && <SsoProviders federations={federations} />}
        </>
      )}
      {isStrategyEnabled('oauth') && <OAuthProviders authStep="invitation" />}

      {tokenData.inactiveMembershipId && (
        <p className="text-center">
          {t('c:have_account')}{' '}
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-base"
            onClick={() => {
              setInviteOtherAccount(true);
              setStep('checkEmail', '');
            }}
          >
            {t('c:sign_in')}
          </Button>
        </p>
      )}

      <LegalNotice mode="continue" className="text-muted-foreground text-sm" />
    </>
  );
}
