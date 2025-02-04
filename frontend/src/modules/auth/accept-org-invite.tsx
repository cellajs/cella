import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useMutation, useQuery } from '@tanstack/react-query';
import { config } from 'config';
import { Ban, Check } from 'lucide-react';
import { toast } from 'sonner';
import { acceptOrgInvite, checkToken } from '~/modules/auth/api';
import AuthNotice from '~/modules/auth/auth-notice';
import Spinner from '~/modules/common/spinner';
import { SubmitButton, buttonVariants } from '~/modules/ui/button';
import { AcceptOrgInviteRoute } from '~/routes/auth';
import { cn } from '~/utils/cn';

// Accept organization invitation when user is signed in
const AcceptOrgInvite = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { token } = useParams({ from: AcceptOrgInviteRoute.id });
  const { tokenId } = useSearch({ from: AcceptOrgInviteRoute.id });

  const {
    mutate: _acceptOrgInvite,
    isPending,
    error: acceptInviteError,
  } = useMutation({
    mutationFn: acceptOrgInvite,
    onSuccess: () => {
      toast.success(t('common:invitation_accepted'));
      navigate({ to: tokenData?.organizationSlug ? `/${tokenData.organizationSlug}` : config.defaultRedirectPath });
    },
  });

  // Accept organization invitation
  const onSubmit = () => {
    _acceptOrgInvite({ token });
  };

  // Set up query options to check token
  const tokenQueryOptions = {
    queryKey: [],
    queryFn: async () => {
      if (!tokenId || !token) return;
      return checkToken({ id: tokenId, type: 'invitation' });
    },
  };

  // Fetch token data on mount
  const { data: tokenData, isLoading, error } = useQuery(tokenQueryOptions);

  if (isLoading) return <Spinner className="h-10 w-10" />;
  if (error || acceptInviteError) return <AuthNotice error={error || acceptInviteError} />;
  if (!tokenData) return null;

  return (
    <>
      <h1 className="text-2xl text-center">{t('common:accept_invite')}</h1>
      <p className="font-light mb-4">{t('common:accept_invite_text', { email: tokenData.email, organization: tokenData.organizationName })}</p>

      {tokenData.email && (
        <div className="space-y-4">
          <SubmitButton loading={isPending} className="w-full" onClick={onSubmit}>
            <Check size={16} className="mr-2" />
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

export default AcceptOrgInvite;
