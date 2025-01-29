import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { config } from 'config';
import { Ban, Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ApiError } from '~/lib/api';
import { useBroadcastChannel } from '~/modules/common/broadcast-channel/context';
import Spinner from '~/modules/common/spinner';
import { useAcceptOrgInviteMutation, useCheckTokenMutation } from '~/modules/general/query-mutations';
import { SubmitButton, buttonVariants } from '~/modules/ui/button';
import { AcceptOrgInviteRoute } from '~/routes/auth';
import type { TokenData } from '~/types/common';
import { cn } from '~/utils/cn';
import AuthNotice from './auth-notice';

const AcceptOrgInvite = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams({ from: AcceptOrgInviteRoute.id });
  const { triggerAction } = useBroadcastChannel();
  const { tokenId } = useSearch({ from: AcceptOrgInviteRoute.id });

  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const { mutate: checkToken, isPending: isChecking } = useCheckTokenMutation();
  const { mutate: acceptOrgInvite, isPending } = useAcceptOrgInviteMutation();

  const onSubmit = () => {
    acceptOrgInvite(
      { token },
      {
        onSuccess: () => {
          triggerAction('refetchMenu', true);
          toast.success(t('common:invitation_accepted'));
          navigate({ to: tokenData?.organizationSlug ? `/${tokenData.organizationSlug}` : config.defaultRedirectPath });
        },
        onError: (error) => setError(error),
      },
    );
  };

  // TODO move this to beforeLoad in the route?
  useEffect(() => {
    if (!tokenId || !token) return;

    checkToken({ id: tokenId }, { onSuccess: (result) => setTokenData(result), onError: (error) => setError(error) });
  }, [tokenId]);

  if (isChecking) return <Spinner />;

  if (error) return <AuthNotice error={error} />;

  return (
    <>
      <h1 className="text-2xl text-center">{t('common:accept_invite')}</h1>

      <p className="font-light mb-4">{t('common:accept_invite_text', { email: tokenData?.email, organization: tokenData?.organizationName })}</p>

      {tokenData?.email && (
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
