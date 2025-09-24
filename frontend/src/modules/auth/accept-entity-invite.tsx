import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { appConfig } from 'config';
import { Ban, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { acceptEntityInvite } from '~/api.gen';
import AuthErrorNotice from '~/modules/auth/error-notice';
import { useCheckToken } from '~/modules/auth/use-token-check';
import Spinner from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { getAndSetMenu } from '~/modules/me/helpers';
import { buttonVariants, SubmitButton } from '~/modules/ui/button';
import { getEntityRoute } from '~/routes-resolver';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';

// Accept entity invitation when user is signed in
const AcceptEntityInvite = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { token } = useParams({ from: '/publicLayout/authLayout/invitation/$token' });
  const { tokenId } = useSearch({ from: '/publicLayout/authLayout/invitation/$token' });

  const { user: currentUser } = useUserStore();

  const { data, isLoading, error } = useCheckToken('invitation', tokenId);

  const {
    mutate: _acceptEntityInvite,
    isPending,
    error: acceptInviteError,
  } = useMutation({
    mutationFn: () => acceptEntityInvite({ path: { token } }),
    onSuccess: async (entity) => {
      await getAndSetMenu();

      toaster(t('common:invitation_accepted', 'success'));

      const { to, params, search } = getEntityRoute(entity);
      navigate({ to, params, search });
    },
  });

  // Accept organization invitation
  const onSubmit = () => _acceptEntityInvite();

  if (isLoading) return <Spinner className="h-10 w-10" />;
  if (error || acceptInviteError) return <AuthErrorNotice error={error || acceptInviteError} />;

  // Handle current user not being the one invited
  if (!data?.userId || data.userId !== currentUser?.id)
    return (
      <AuthErrorNotice error={new Error(t('error:invitation_not_for_you'))}>
        <Link to="/sign-out" reloadDocument className={buttonVariants({ size: 'lg' })}>
          {t('common:sign_out_first')}
        </Link>
      </AuthErrorNotice>
    );

  return (
    <>
      <h1 className="text-2xl text-center">{t('common:accept_invite')}</h1>
      <p className="font-light mb-4">{t('common:accept_invite_text', { email: data.email, organization: data.organizationName, role: data.role })}</p>

      {data.email && (
        <div className="space-y-4">
          <SubmitButton loading={isPending} className="w-full" onClick={onSubmit}>
            <Check size={16} strokeWidth={3} className="mr-2" />
            {t('common:accept')}
          </SubmitButton>
          <Link to={appConfig.defaultRedirectPath} preload={false} className={cn('w-full', buttonVariants({ variant: 'secondary' }))}>
            <Ban size={16} className="mr-2" />
            {t('common:decline')}
          </Link>
        </div>
      )}
    </>
  );
};

export default AcceptEntityInvite;
