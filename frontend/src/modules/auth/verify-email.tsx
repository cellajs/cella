import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { Check, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { sendVerificationEmail, verifyEmail } from '~/modules/auth/api';
import AuthNotice from '~/modules/auth/auth-notice';
import Spinner from '~/modules/common/spinner';
import { createToast } from '~/modules/common/toaster';
import { Button } from '~/modules/ui/button';
import { VerifyEmailWithTokenRoute } from '~/routes/auth';

const VerifyEmail = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { token } = useParams({ from: VerifyEmailWithTokenRoute.id });
  const { tokenId } = useSearch({ from: VerifyEmailWithTokenRoute.id });

  // Resend verification email
  const { mutate, isPending, isSuccess } = useMutation({
    mutationFn: () => sendVerificationEmail({ tokenId }),
    onSuccess: () => {
      createToast(t('common:success.sent_verification_email'), 'success');
    },
  });

  // Set up query to verify email
  // On success, redirect to welcome page
  const tokenQueryOptions = {
    queryKey: [],
    queryFn: async () => {
      if (!token) return;
      return verifyEmail({ token });
    },
    onSuccess: () => {
      createToast(t('common:success.email_verified'), 'success');
      navigate({ to: config.welcomeRedirectPath });
    },
  };

  // Verify email directly
  const { isLoading, error } = useQuery(tokenQueryOptions);

  if (isLoading) return <Spinner className="h-10 w-10" />;
  if (error)
    return (
      <AuthNotice error={error}>
        <Button size="lg" onClick={() => mutate()} disabled={isSuccess} loading={isPending}>
          {isSuccess ? <Check size={16} /> : <Mail size={16} />}
          {isSuccess ? t('common:resend_sent') : t('common:resend_email')}
        </Button>
      </AuthNotice>
    );

  return null;
};

export default VerifyEmail;
