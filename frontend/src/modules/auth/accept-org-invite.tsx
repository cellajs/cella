import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { useQuery } from '@tanstack/react-query';
import { config } from 'config';
import { Ban, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useBroadcastChannel } from '~/modules/common/broadcast-channel/context';
import Spinner from '~/modules/common/spinner';
import { useAcceptOrgInviteMutation } from '~/modules/general/query-mutations';
import { SubmitButton, buttonVariants } from '~/modules/ui/button';
import { AcceptOrgInviteRoute } from '~/routes/auth';
import { cn } from '~/utils/cn';
import { checkToken } from './api';
import AuthNotice from './auth-notice';

const AcceptOrgInvite = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { token } = useParams({ from: AcceptOrgInviteRoute.id });
  const { triggerAction } = useBroadcastChannel();
  const { tokenId } = useSearch({ from: AcceptOrgInviteRoute.id });

  const { mutate: acceptOrgInvite, isPending, error: acceptInviteError } = useAcceptOrgInviteMutation();

  // Accept organization invitation
  const onSubmit = () => {
    acceptOrgInvite(
      { token },
      {
        onSuccess: () => {
          triggerAction('refetchMenu', true);
          toast.success(t('common:invitation_accepted'));
          navigate({ to: tokenData?.organizationSlug ? `/${tokenData.organizationSlug}` : config.defaultRedirectPath });
        },
      },
    );
  };

  const tokenQueryOptions = {
    queryKey: ['tokenData', tokenId],
    queryFn: async () => {
      if (!tokenId || !token) return;
      return checkToken({ id: tokenId, type: 'invitation' });
    },
    staleTime: 0,
  };

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
