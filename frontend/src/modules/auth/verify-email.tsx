import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useOnlineManager } from '~/hooks/use-online-manager';
import type { TokenType } from '~/modules/auth/api';
import { useVerifyEmailMutation } from '~/modules/auth/query-mutations';
import { createToast } from '~/modules/common/toaster';
import { Button } from '~/modules/ui/button';
import { VerifyEmailWithTokenRoute } from '~/routes/auth';

const VerifyEmail = () => {
  const { t } = useTranslation();
  const { token }: TokenType = useParams({ from: VerifyEmailWithTokenRoute.id });
  const navigate = useNavigate();
  const { isOnline } = useOnlineManager();

  const { mutate: verifyEmail, error } = useVerifyEmailMutation();

  const onSuccess = () => {
    toast.success(t('common:success.email_verified'));
    navigate({ to: '/welcome' });
  };

  const resendEmail = () => {
    if (!isOnline) return createToast(t('common:action.offline.text'), 'warning');
    verifyEmail({ token, resend: true }, { onSuccess });
  };

  useEffect(() => {
    if (!token) return;
    verifyEmail({ token }, { onSuccess });
  }, []);

  if (token) {
    if (!error) return null;

    return (
      <div className="text-center">
        <h1 className="text-2xl">{t('common:error.unable_to_verify')}</h1>
        <p className="font-light mt-4">{t('common:error.token_invalid_request_new')}</p>
        <Button className="mt-8" onClick={resendEmail}>
          {t('common:resend_email')}
        </Button>
      </div>
    );
  }
};

export default VerifyEmail;
