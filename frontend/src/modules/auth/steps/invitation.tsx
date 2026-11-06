import { useMutation } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { MailIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type GetAuthHealthResponse, sendMagicLink } from 'sdk';
import { appConfig, isStrategyEnabled } from 'shared';
import { useShallow } from 'zustand/react/shallow';
import { ApiError } from '~/lib/api';
import { type AuthAlternative, AuthAlternatives } from '~/modules/auth/auth-alternatives';
import { AuthHeader, InvitationAvatar } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { LegalNotice } from '~/modules/auth/legal-notice';
import { useOAuthAlternatives } from '~/modules/auth/oauth-strategy';
import { useSsoAlternatives } from '~/modules/auth/sso-strategy';
import type { TokenData } from '~/modules/auth/types';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { InlineLinkButton } from '~/modules/common/inline-link-button';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';

const magicLinkEnabled = isStrategyEnabled('magic');

interface InvitationStepProps {
  tokenData: TokenData;
  federations?: GetAuthHealthResponse['federations'];
}

/**
 * Landing step for a signed-out visitor holding an invitation: who invited them to what, and the ways in. The emailed
 * link goes to the invited address, where it signs in or creates the account. The institution of the invited
 * organization comes first when it has one. A membership invitation can also be answered with an account on another
 * address: the visitor signs in first and the confirm step follows.
 */
export function InvitationStep({ tokenData, federations }: InvitationStepProps) {
  const { t } = useTranslation();
  const { setStep, setMagicLinkSent, setInviteOtherAccount } = useAuthStore(
    useShallow((state) => ({
      setStep: state.setStep,
      setMagicLinkSent: state.setMagicLinkSent,
      setInviteOtherAccount: state.setInviteOtherAccount,
    })),
  );
  const { redirect } = useSearch({ from: '/_public/auth/authenticate' });

  const { email, invitation, ssoConnectionId } = tokenData;

  const sso = useSsoAlternatives(ssoConnectionId, federations);
  const oauth = useOAuthAlternatives('invitation');

  const { mutate: sendLink, isPending } = useMutation({
    mutationFn: () => sendMagicLink({ body: { email, redirect } }),
    onSuccess: () => {
      // An account may hold the invited address by now: the link then signs in.
      setMagicLinkSent(email, tokenData.userId ? 'signin' : 'signup');
    },
    // The global handler toasts an ApiError; a failure without a server answer gets this toast
    onError: (error) => {
      if (!(error instanceof ApiError)) toaster.error(t('error:reported_try_later'));
    },
  });

  // The ways in are ordered once the institution lookup settles.
  if (sso.isLoading) return <Spinner size="lg" />;

  const { institution } = sso;

  // The address shows once the link is sent, on the sent step.
  const emailWay: AuthAlternative | null = magicLinkEnabled
    ? { id: 'email', icon: MailIcon, label: t('c:continue_with_email'), shortLabel: t('c:email'), loading: isPending, onClick: () => sendLink() }
    : null;

  return (
    <>
      <AuthHeader
        image={invitation && <InvitationAvatar invitation={invitation} />}
        title={t('c:invite_join', { name: invitation?.entityName ?? appConfig.name })}
        description={invitation && t('c:invite_join.text', { inviterName: invitation.inviterName, role: t(`c:${invitation.role}`) })}
      />

      {institution ? (
        <Button size="block" render={<a href={institution.href} />}>
          <institution.icon />
          <span className="truncate">{institution.label}</span>
        </Button>
      ) : (
        emailWay && (
          <SubmitButton size="block" loading={isPending} icon={<MailIcon />} onClick={emailWay.onClick}>
            {emailWay.label}
          </SubmitButton>
        )
      )}

      <AuthAlternatives authStep="invitation" items={[...(institution && emailWay ? [emailWay] : []), ...sso.federations, ...oauth]} />

      {tokenData.inactiveMembershipId && (
        <p className="text-center">
          {t('c:have_account')}{' '}
          <InlineLinkButton
            onClick={() => {
              setInviteOtherAccount(true);
              setStep('checkEmail', '');
            }}
          >
            {t('c:sign_in')}
          </InlineLinkButton>
        </p>
      )}

      <LegalNotice mode="continue" className="text-muted-foreground text-sm" />
    </>
  );
}
