import { useNavigate, useParams } from '@tanstack/react-router';
import AuthPage from '.';
import { useApiWrapper } from '~/hooks/useApiWrapper';
import { useEffect } from 'react';
import { verifyEmail } from '~/api/api';
import { Button } from '~/components/ui/button';

const VerifyEmail = () => {
  const { token } = useParams({ strict: false });
  const [apiWrapper, , error] = useApiWrapper();
  const navigate = useNavigate();

  const resendEmail = () => {
    verifyEmail(token, true);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: call apiWrapper only once
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
      (error) => {
        console.error(error);
      },
    );
  }, []);

  if (token) {
    if (error) {
      return (
        <AuthPage>
          <div className="text-center">
            <h1 className="text-2xl">Something went wrong</h1>
            <p className="font-light mt-4">{error.message}</p>
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
