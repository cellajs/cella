import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { verifyEmail as baseVerifyEmail } from '~/api/auth';
import { useMutation } from '~/hooks/use-mutations';
import { Button } from '~/modules/ui/button';
import AuthPage from './auth-page';

const VerifyEmail = () => {
  const { t } = useTranslation();
  const { token }: { token: string } = useParams({ strict: false });
  const navigate = useNavigate();

  const { mutate: verifyEmail, error } = useMutation({
    mutationFn: baseVerifyEmail,
    onSuccess: () => {
      toast.success(t('common:success.email_verified'));
      navigate({ to: '/welcome' });
    },
  });

  const resendEmail = () => {
    verifyEmail({ token, resend: true });
  };

  useEffect(() => {
    if (!token) return;
    verifyEmail({ token });
  }, []);

  if (token) {
    if (error) {
      return (
        <AuthPage>
          <div className="text-center">
            <h1 className="text-2xl">{t('common:error.unable_to_verify')}</h1>
            <p className="font-light mt-4">{t('common:error.token_invalid_request_new')}</p>
            <Button className="mt-8" onClick={resendEmail}>
              {t('common:resend_email')}
            </Button>
          </div>
        </AuthPage>
      );
    }

    return null;
  }

  return (
    <AuthPage>
      <div className="text-center">
        <h1 className="text-2xl">{t('common:almost_there')}</h1>
        <p className="font-light mt-4">{t('common:verify_email_notice.text')}</p>
      </div>
    </AuthPage>
  );
};

export default VerifyEmail;
