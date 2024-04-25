import { useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { useMutation } from '~/hooks/use-mutations';
import type { ApiError } from '~/api';
import { acceptInvite as baseAcceptInvite } from '~/api/general';
import { checkToken as baseCheckToken } from '~/api/general';
import AuthPage from '../auth/auth-page';

const AcceptInvite = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token }: { token: string } = useParams({ strict: false });

  const [email, setEmail] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  const { mutate: checkToken } = useMutation({
    mutationFn: baseCheckToken,
    onSuccess: (data) => setEmail(data?.email || ''),
    onError: (error) => setError(error),
  });

  const { mutate: acceptInvite, isPending } = useMutation({
    mutationFn: baseAcceptInvite,
    onSuccess: () => {
      toast.success(t('common:invitation_accepted'));
      navigate({
        to: '/home',
      });
    },
    onError: (error) => {
      setError(error);
    },
  });

  const onSubmit = () => {
    acceptInvite({
      token,
    });
  };

  useEffect(() => {
    if (!token) return;
    checkToken(token);
  }, [token]);

  return (
    <AuthPage>
      <Card>
        <CardHeader>
          <CardTitle>{t('common:accept_invite')}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
              <span className="block sm:inline">{error.message}</span>
            </div>
          )}
          <p>{t('common:accept_invite_text', { email })}</p>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isPending}
            className="mt-4 w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          >
            {t('common:accept_invite')}
          </button>
        </CardContent>
      </Card>
    </AuthPage>
  );
};

export default AcceptInvite;
