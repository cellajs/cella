import { onlineManager } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { verifyEmail as baseVerifyEmail } from '~/api/auth';
import { useMutation } from '~/hooks/use-mutations';
import { showToast } from '~/lib/toasts';
import AuthPage from '~/modules/auth/auth-page';
import { Button } from '~/modules/ui/button';

const VerifyEmail = () => {
  const { t } = useTranslation();
  //Strict false is needed because the component is used in two places, one of which does not include parameters
  const { token }: { token: string } = useParams({ strict: false });
  const navigate = useNavigate();

  const [isOnline, setIsOnline] = useState(onlineManager.isOnline());

  const { mutate: verifyEmail, error } = useMutation({
    mutationFn: baseVerifyEmail,
    onSuccess: () => {
      toast.success(t('common:success.email_verified'));
      navigate({ to: '/welcome' });
    },
  });

  const resendEmail = () => {
    if (!onlineManager.isOnline()) return showToast(t('common:action.offline.text'), 'warning');
    verifyEmail({ token, resend: true });
  };

  useEffect(() => {
    if (!token) return;
    verifyEmail({ token });
  }, []);

  // Subscribe to online status changes
  useEffect(() => {
    const unsubscribe = onlineManager.subscribe(() => setIsOnline(onlineManager.isOnline()));
    return () => unsubscribe();
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
        <p className="font-light mt-4">{t(`common:${isOnline ? 'verify_email_notice.text' : 'offline.text'}`)}</p>
      </div>
    </AuthPage>
  );
};

export default VerifyEmail;
