import { useMutation } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { appConfig } from 'config';
import { Lock, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { type ResendInvitationResponse, resendInvitation } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import AuthErrorNotice from '~/modules/auth/auth-error-notice';
import { CheckEmailForm } from '~/modules/auth/check-email-form';
import { shouldShowDivider } from '~/modules/auth/helpers';
import OAuthOptions from '~/modules/auth/oauth-options';
import PasskeyOption from '~/modules/auth/passkey-option';
import { SignInForm } from '~/modules/auth/sign-in-form';
import { SignUpForm } from '~/modules/auth/sign-up-form';
import type { AuthStep } from '~/modules/auth/types';
import { useCheckToken } from '~/modules/auth/use-token-check';
import { WaitlistForm } from '~/modules/auth/waitlist-form';
import Spinner from '~/modules/common/spinner';
import { AuthenticateRoute } from '~/routes/auth';
import { useUserStore } from '~/store/user';
import { useDialoger } from '../common/dialoger/use-dialoger';
import { Button } from '../ui/button';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;
const emailEnabled = enabledStrategies.includes('password') || enabledStrategies.includes('passkey');

const AuthSteps = () => {
  const { t } = useTranslation();
  const { lastUser, passkey } = useUserStore();

  const { token, tokenId } = useSearch({ from: AuthenticateRoute.id });
  const [authError, setAuthError] = useState<ApiError | null>(null);
  const [step, setStep] = useState<AuthStep>(!token && lastUser?.email ? 'signIn' : 'checkEmail');
  const [email, setEmail] = useState((!token && lastUser?.email) || '');
  const [hasPasskey, setHasPasskey] = useState(!token && !!passkey);

  // Update step and email to proceed after email is checked
  const handleSetStep = (step: AuthStep, email: string, error?: ApiError) => {
    setEmail(email);
    setStep(step);
    if (error) setAuthError(error);
  };

  // Reset steps to the first action: check email
  // Even if all email authentication is disabled, we still show check email form
  const resetSteps = () => {
    setStep('checkEmail');
    setHasPasskey(false);
  };

  // TODO make into a ResendInvitationButton component? Also keep state to prevent multiple sends, similar to disabledResetPassword
  const { mutate: _resendInvitation, isPending } = useMutation<ResendInvitationResponse, ApiError, string>({
    mutationFn: () => resendInvitation({ body: { email } }),
    onSuccess: () => {
      toast.success(t('common:success.resend_invitation'));
      useDialoger.getState().remove();
    },
    onError: () => document.getElementById('reset-email-field')?.focus(),
  });

  const { data: tokenData, isLoading, error } = useCheckToken('invitation', tokenId, !!(token && tokenId));

  // If token is provided, directly set email and step based on token data
  useEffect(() => {
    if (!token || !tokenData?.email) return;

    setEmail(tokenData.email);
    setStep(tokenData.userId ? 'signIn' : 'signUp');
  }, [tokenData]);

  if (isLoading) return <Spinner className="h-10 w-10" />;
  if (error) return <AuthErrorNotice error={error} />;

  // Render form based on current step
  return (
    <>
      {step === 'checkEmail' && <CheckEmailForm emailEnabled={emailEnabled} setStep={handleSetStep} />}
      {step === 'signIn' && <SignInForm emailEnabled={emailEnabled} email={email} resetSteps={resetSteps} />}
      {step === 'signUp' && (
        <SignUpForm emailEnabled={emailEnabled} tokenData={tokenData} email={email} setStep={handleSetStep} resetSteps={resetSteps} />
      )}
      {step === 'waitlist' && (
        <WaitlistForm
          buttonContent={
            <>
              <Lock size={16} className="mr-2" />
              <span className="text-base">{t('common:request_access')}</span>
            </>
          }
          email={email}
          changeEmail={resetSteps}
        />
      )}
      {step === 'inviteOnly' && (
        <>
          <h1 className="text-2xl text-center pb-2 mt-4">{t('common:hi')}</h1>
          <h2 className="text-xl text-center pb-4 mt-4">{t('common:invite_only.text', { appName: appConfig.name })}</h2>
        </>
      )}
      {step === 'error' && (
        <AuthErrorNotice error={authError}>
          {authError?.type === 'invite_takes_priority' && (
            <Button size="lg" onClick={() => _resendInvitation(email)} loading={isPending}>
              <Mail size={16} className="mr-2" />
              {t('common:resend')}
            </Button>
          )}
        </AuthErrorNotice>
      )}

      {/* Show passkey and oauth options conditionally */}
      {!['inviteOnly', 'waitlist', 'error'].includes(step) && (
        <>
          {shouldShowDivider(hasPasskey, step) && (
            <div className="relative flex justify-center text-xs uppercase">
              <span className="text-muted-foreground px-2">{t('common:or')}</span>
            </div>
          )}
          {hasPasskey && enabledStrategies.includes('passkey') && <PasskeyOption email={email} actionType={step} />}
          {enabledStrategies.includes('oauth') && <OAuthOptions actionType={step} />}
        </>
      )}
    </>
  );
};

export default AuthSteps;
