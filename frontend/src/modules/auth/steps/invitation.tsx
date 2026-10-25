import { useMutation, useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { MailIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type GetAuthHealthResponse, sendMagicLink } from 'sdk';
import { appConfig, isStrategyEnabled } from 'shared';
import { useShallow } from 'zustand/react/shallow';
import { AuthDivider } from '~/modules/auth/auth-divider';
import { AuthHeader } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { LegalNotice } from '~/modules/auth/legal-notice';
import { OAuthProviders } from '~/modules/auth/oauth-providers';
import { ssoEntryQueryOptions } from '~/modules/auth/query';
import { SsoProviders } from '~/modules/auth/sso-providers';
import type { TokenData } from '~/modules/auth/types';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { InlineLinkButton } from '~/modules/common/inline-link-button';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';

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

  // Shared with the institution button, so the order of the ways in is settled before anything shows.
  const { data: entry, isLoading: isEntryLoading } = useQuery(ssoEntryQueryOptions(ssoConnectionId));
  const institutionFirst = entry?.status === 'active';

  const { mutate: sendLink, isPending } = useMutation({
    mutationFn: () => sendMagicLink({ body: { email, redirect } }),
    onSuccess: () => {
      // An account may hold the invited address by now: the link then signs in.
      setMagicLinkSent(email, tokenData.userId ? 'signin' : 'signup');
    },
    onError: () => toaster.error(t('error:reported_try_later')),
  });

  if (isEntryLoading) return <Spinner size="lg" />;

  // The address shows once the link is sent, on the sent step.
  const emailWay = magicLinkEnabled && (
    <SubmitButton
      variant={institutionFirst ? 'plain' : 'default'}
      loading={isPending}
      icon={<MailIcon />}
      className="w-full"
      onClick={() => sendLink()}
    >
      {t('c:continue_with_email')}
    </SubmitButton>
  );

  return (
    <>
      <AuthHeader
        image={invitation && <EntityAvatar type={invitation.entityType} name={invitation.entityName} className="size-14" />}
        title={t('c:invite_join', { name: invitation?.entityName ?? appConfig.name })}
      >
        {invitation && (
          <p className="font-light">
            {t('c:invite_join.text', { inviterName: invitation.inviterName, role: t(`c:${invitation.role}`).toLowerCase() })}
          </p>
        )}
      </AuthHeader>

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
