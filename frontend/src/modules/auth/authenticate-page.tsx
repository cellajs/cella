import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeftIcon, ServerOffIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, isStrategyEnabled } from 'shared';
import { useShallow } from 'zustand/react/shallow';
import { AuthDivider } from '~/modules/auth/auth-divider';
import { useAuthStore } from '~/modules/auth/auth-store';
import { OAuthProviders } from '~/modules/auth/oauth-providers';
import { authHealthQueryOptions, tokenDataQueryOptions } from '~/modules/auth/query';
import { SsoProviders } from '~/modules/auth/sso-providers';
import { AcceptInvitationStep, CheckEmailStep, InvitationStep, MagicLinkSentStep, SignInStep, SignUpStep, WaitlistStep } from '~/modules/auth/steps';
import type { TokenData } from '~/modules/auth/types';
import { EntityChip } from '~/modules/common/entity-chip';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { meQueryOptions } from '~/modules/me/query';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

// Warn after this delay that the backend is slow to answer.
const healthSlowMs = 5000;

export function AuthenticatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { tokenId } = useSearch({ from: '/_public/auth/authenticate' });

  const lastUser = useUserStore((state) => state.lastUser);
  const { step, setStep, restrictedMode, setRestrictedMode, signedIn, inviteOtherAccount, setInviteOtherAccount } = useAuthStore(
    useShallow((state) => ({
      step: state.step,
      setStep: state.setStep,
      restrictedMode: state.restrictedMode,
      setRestrictedMode: state.setRestrictedMode,
      signedIn: state.signedIn,
      inviteOtherAccount: state.inviteOtherAccount,
      setInviteOtherAccount: state.setInviteOtherAccount,
    })),
  );

  // Cache-only: the route guard probes the session whenever a tokenId is present.
  const { data: signedInUser } = useQuery({ ...meQueryOptions(), enabled: false });

  // A signed-in visitor gets this page's own notice for a spent token, so the global toast stays quiet for them.
  const tokenQuery = tokenDataQueryOptions('invitation', tokenId);
  const {
    data: tokenData,
    isLoading: isTokenLoading,
    isError: isTokenError,
  } = useQuery({ ...tokenQuery, meta: { ...tokenQuery.meta, suppressGlobalErrorToast: !!signedInUser } });

  const { data: healthData, isLoading: isHealthLoading, isError: isHealthError } = useQuery(authHealthQueryOptions);

  const [showSlowWarning, setShowSlowWarning] = useState(false);
  useEffect(() => {
    if (!isHealthLoading) {
      setShowSlowWarning(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowWarning(true), healthSlowMs);
    return () => clearTimeout(timer);
  }, [isHealthLoading]);

  // Only ever switches the neutral step on: an address this browser is not recognized for switches it on as well.
  useEffect(() => {
    if (healthData?.restrictedMode) setRestrictedMode(true);
  }, [healthData, setRestrictedMode]);

  useEffect(() => {
    // Don't override terminal steps (e.g. magicLinkSent)
    if (step === 'magicLinkSent') return;

    if (lastUser?.email && !tokenId) return setStep('signIn', lastUser.email);

    // An invitation pins the flow to its own step, unless the visitor chose to answer it with another account.
    if (!tokenData?.email || inviteOtherAccount) {
      if (restrictedMode && step === 'checkEmail') {
        setStep('signIn', '');
      }
      return;
    }
    setStep('invitation', tokenData.email);
  }, [tokenData, lastUser, restrictedMode, step, inviteOtherAccount]);

  // Signed in, but the token is spent, expired or not a membership invitation: nothing to confirm, so leave the auth pages.
  const nothingToConfirm = !!signedInUser && !!tokenId && !isTokenLoading && !tokenData?.inactiveMembershipId;
  useEffect(() => {
    if (!nothingToConfirm) return;
    if (isTokenError) toaster.info(t('c:invite_link_spent'));
    navigate({ to: appConfig.defaultRedirectPath, replace: true });
  }, [nothingToConfirm]);

  if (isTokenLoading || isHealthLoading || signedIn) {
    return (
      <>
        <Spinner size="lg" />
        {showSlowWarning && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>{t('c:server_unresponsive')}</AlertTitle>
            <AlertDescription>{t('c:server_unresponsive.text')}</AlertDescription>
          </Alert>
        )}
      </>
    );
  }

  // Signed in and holding a membership invitation: the confirm step accepts it as this account.
  if (signedInUser && tokenData?.inactiveMembershipId) {
    return <AcceptInvitationStep tokenData={tokenData} user={signedInUser} />;
  }

  // The steps that sign in or up; the invitation step lays out its own ways in.
  const isSigningIn = ['checkEmail', 'signIn', 'signUp'].includes(step);

  return (
    <>
      {step === 'invitation' && tokenData && <InvitationStep tokenData={tokenData} federations={healthData?.federations} />}

      {/* Answering an invitation with another account: it stays in view while signing in */}
      {isSigningIn && inviteOtherAccount && tokenData?.invitation && <InvitationChip invitation={tokenData.invitation} />}

      {step === 'checkEmail' && !restrictedMode && <CheckEmailStep />}

      {step === 'signIn' && <SignInStep />}
      {step === 'signUp' && <SignUpStep tokenData={tokenData} />}

      {step === 'waitlist' && <WaitlistStep />}
      {step === 'magicLinkSent' && <MagicLinkSentStep />}

      {isSigningIn && (
        <>
          <AuthDivider />
          {isStrategyEnabled('sso') && <SsoProviders connectionId={tokenData?.ssoConnectionId} federations={healthData?.federations} />}
          {isStrategyEnabled('oauth') && <OAuthProviders authStep={step} />}
          {inviteOtherAccount && (
            <Button type="button" variant="ghost" onClick={() => setInviteOtherAccount(false)}>
              <ArrowLeftIcon />
              {t('c:invite_back')}
            </Button>
          )}
        </>
      )}

      {isHealthError && (
        <Alert variant="destructive">
          <ServerOffIcon />
          <AlertTitle>{t('c:server_unreachable')}</AlertTitle>
          <AlertDescription>{t('c:server_unreachable.text')}</AlertDescription>
        </Alert>
      )}
    </>
  );
}

/** Names the invitation being answered, above the steps that sign in to another account. */
function InvitationChip({ invitation }: { invitation: NonNullable<TokenData['invitation']> }) {
  const { t } = useTranslation();

  return (
    <EntityChip type={invitation.entityType} name={invitation.entityName} size="lg" className="mx-auto border-primary/20 bg-primary/5 pr-3">
      {t('c:invitation_to', { name: invitation.entityName })}
    </EntityChip>
  );
}
