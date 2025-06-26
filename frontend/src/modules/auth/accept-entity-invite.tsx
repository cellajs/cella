import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { Ban, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import AuthErrorNotice from '~/modules/auth/auth-error-notice';
import { useTokenCheck } from '~/modules/auth/use-token-check';
import Spinner from '~/modules/common/spinner';
import { getAndSetMenu } from '~/modules/me/helpers';
import { buttonVariants, SubmitButton } from '~/modules/ui/button';
import { getEntityRoute } from '~/nav-config';
import { acceptEntityInvite } from '~/openapi-client';
import { AcceptEntityInviteRoute } from '~/routes/auth';
import { cn } from '~/utils/cn';

// Accept organization invitation when user is signed in
const AcceptEntityInvite = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { token } = useParams({ from: AcceptEntityInviteRoute.id });
  const { tokenId } = useSearch({ from: AcceptEntityInviteRoute.id });

  const { data, isLoading, error } = useTokenCheck('invitation', tokenId);

  const {
    mutate: _acceptEntityInvite,
    isPending,
    error: acceptInviteError,
  } = useMutation({
    mutationFn: () => acceptEntityInvite({ path: { token } }),
    onSuccess: async (entity) => {
      await getAndSetMenu();

      toast.success(t('common:invitation_accepted'));

      const { to, params, search } = getEntityRoute(entity);
      navigate({ to, params, search });
    },
  });

  // Accept organization invitation
  const onSubmit = () => _acceptEntityInvite();

  if (isLoading) return <Spinner className="h-10 w-10" />;
  if (error || acceptInviteError) return <AuthErrorNotice error={error || acceptInviteError} />;
  if (!data) return null;

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
          <Link to={config.defaultRedirectPath} preload={false} className={cn('w-full', buttonVariants({ variant: 'secondary' }))}>
            <Ban size={16} className="mr-2" />
            {t('common:decline')}
          </Link>
        </div>
      )}
    </>
  );
};

export default AcceptEntityInvite;
