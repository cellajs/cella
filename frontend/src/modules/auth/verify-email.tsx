import { useMutation } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { ArrowRight, Check, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { sendVerificationEmail, type VerifyEmailResponse, verifyEmail } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import AuthErrorNotice from '~/modules/auth/auth-error-notice';
import { useTokenCheck } from '~/modules/auth/use-token-check';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster';
import { Button } from '~/modules/ui/button';
import { VerifyEmailWithTokenRoute } from '~/routes/auth';

const VerifyEmail = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { token } = useParams({ from: VerifyEmailWithTokenRoute.id });
  const { tokenId } = useSearch({ from: VerifyEmailWithTokenRoute.id });

  const { data, isLoading, error } = useTokenCheck('email_verification', tokenId);

  // Verify email with token
  const { mutate: verify, isPending: isVerifying } = useMutation<VerifyEmailResponse, ApiError>({
    mutationFn: () => verifyEmail({ path: { token } }),
    onSuccess: () => {
      toaster(t('common:success.email_verified'), 'success');
      navigate({ to: config.welcomeRedirectPath });
    },
  });

  // Resend verification email
  const {
    mutate: resendVerification,
    isPending,
    isSuccess,
  } = useMutation({
    mutationFn: () => sendVerificationEmail({ body: { tokenId } }),
    onSuccess: () => toaster(t('common:success.sent_verification_email'), 'success'),
  });

  // Checking token by id
  if (isLoading || isVerifying) return <Spinner className="h-10 w-10" />;

  // Check token failed
  if (error)
    return (
      <AuthErrorNotice error={error}>
        {/* Show resend option if possible */}
        {error.status && ![404, 429].includes(error.status) && (
          <Button size="lg" onClick={() => resendVerification()} className="flex gap-2" disabled={isSuccess} loading={isPending}>
            {isSuccess ? <Check size={16} /> : <Mail size={16} />}
            {isSuccess ? t('common:resend_sent') : t('common:resend_email')}
          </Button>
        )}
      </AuthErrorNotice>
    );

  return (
    <div className="text-center">
      <h1 className="text-2xl">{t('common:verify_email', { email: data?.email })}</h1>
      <Button size="lg" onClick={() => verify()} className="mt-6" loading={isVerifying}>
        {t('common:verify_signin')}
        <ArrowRight size={16} className="ml-2" />
      </Button>
    </div>
  );
};

export default VerifyEmail;
