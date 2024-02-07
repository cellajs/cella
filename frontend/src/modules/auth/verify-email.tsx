import { useNavigate, useParams } from '@tanstack/react-router';
import { useEffect } from 'react';
import { verifyEmail } from '~/api/authentication';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { Button } from '~/modules/ui/button';
import AuthPage from '.';

const VerifyEmail = () => {
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
            <h1 className="text-2xl">Something went wrong</h1>
            <p className="font-light mt-4">Token is invalid or expired. Please request a new one.</p>
            <Button className="mt-8" onClick={resendEmail}>
              Resend email
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
        <h1 className="text-2xl">Almost there!</h1>
        <p className="font-light mt-4">We sent you an email. Please check your inbox and click on the link to verify your email address.</p>
      </div>
    </AuthPage>
  );
};

export default VerifyEmail;
