import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { Ban, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { acceptOrgInvite } from '~/modules/auth/api';
import AuthErrorNotice from '~/modules/auth/auth-error-notice';
import { useTokenCheck } from '~/modules/auth/use-token-check';
import Spinner from '~/modules/common/spinner';
import { getAndSetMenu } from '~/modules/me/helpers';
import { SubmitButton, buttonVariants } from '~/modules/ui/button';
import { AcceptOrgInviteRoute } from '~/routes/auth';
import { cn } from '~/utils/cn';

// Accept organization invitation when user is signed in
const AcceptOrgInvite = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { token } = useParams({ from: AcceptOrgInviteRoute.id });
  const { tokenId } = useSearch({ from: AcceptOrgInviteRoute.id });

  const { data, isLoading, error } = useTokenCheck('invitation', tokenId);

  const {
    mutate: _acceptOrgInvite,
    isPending,
    error: acceptInviteError,
  } = useMutation({
    mutationFn: acceptOrgInvite,
    onSuccess: () => {
      getAndSetMenu();
      toast.success(t('common:invitation_accepted'));
      navigate({ to: data?.organizationSlug ? `/${data.organizationSlug}` : config.defaultRedirectPath });
    },
  });

  // Accept organization invitation
  const onSubmit = () => {
    _acceptOrgInvite({ token });
  };

  if (isLoading) return <Spinner className="h-10 w-10" />;
  if (error || acceptInviteError) return <AuthErrorNotice error={error || acceptInviteError} />;
  if (!data) return null;

  return (
    <>
      <h1 className="text-2xl text-center">{t('common:accept_invite')}</h1>
      <p className="font-light mb-4">{t('common:accept_invite_text', { email: data.email, organization: data.organizationName })}</p>

      {data.email && (
        <div className="space-y-4">
          <SubmitButton loading={isPending} className="w-full" onClick={onSubmit}>
            <Check size={16} className="mr-1" />
            {t('common:accept')}
          </SubmitButton>
          <Link to={config.defaultRedirectPath} preload={false} className={cn('w-full', buttonVariants({ variant: 'secondary' }))}>
            <Ban size={16} className="mr-1" />
            {t('common:decline')}
          </Link>
        </div>
      )}
    </>
  );
};

export default AcceptOrgInvite;
