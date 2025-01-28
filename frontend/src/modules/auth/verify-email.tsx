import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { sendVerificationEmail } from '~/modules/auth/api';
import { useVerifyEmailMutation } from '~/modules/auth/query-mutations';
import { createToast } from '~/modules/common/toaster';
import { Button } from '~/modules/ui/button';
import { VerifyEmailWithTokenRoute } from '~/routes/auth';

const VerifyEmail = () => {
  const { t } = useTranslation();
  const { token } = useParams({ from: VerifyEmailWithTokenRoute.id });
  const { tokenId } = useSearch({ from: VerifyEmailWithTokenRoute.id });
  const navigate = useNavigate();

  const { mutate: verifyEmail, error } = useVerifyEmailMutation();

  const onSuccess = () => {
    createToast(t('common:success.email_verified'), 'success');
    navigate({ to: '/welcome' });
  };

  const sendEmailVerification = () => {
    if (!tokenId) return;
    sendVerificationEmail({ tokenId });
  };

  useEffect(() => {
    if (!token) return;
    verifyEmail({ token }, { onSuccess });
  }, []);

  if (token) {
    if (!error) return null;

    return (
      <div className="text-center">
        <h1 className="text-2xl">{t('error:unable_to_verify')}</h1>
        <p className="font-light mt-4">{t('error:invalid_token')}</p>
        {tokenId && (
          <Button className="mt-8" onClick={sendEmailVerification}>
            {t('common:resend_email')}
          </Button>
        )}
      </div>
    );
  }
};

export default VerifyEmail;
