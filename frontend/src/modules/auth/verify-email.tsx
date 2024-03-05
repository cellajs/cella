import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { verifyEmail } from '~/api/authentication';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { Button } from '~/modules/ui/button';
import AuthPage from '.';

const VerifyEmail = () => {
  const { t } = useTranslation();
  const { token }: { token: string } = useParams({ strict: false });
  const [apiWrapper, , error] = useApiWrapper();
  const navigate = useNavigate();

  const resendEmail = () => {
    verifyEmail(token, true);
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    apiWrapper(
      () => verifyEmail(token),
      () => {
        navigate({
          to: '/home',
        });
      },
    );
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
        <p className="font-light mt-4">{t('common:text.verify_email_notice')}</p>
      </div>
    </AuthPage>
  );
};

export default VerifyEmail;
