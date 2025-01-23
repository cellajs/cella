import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { config } from 'config';
import { ArrowRight, Ban, Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ApiError } from '~/lib/api';
import Spinner from '~/modules/common/spinner';
import { useAcceptInviteMutation, useCheckTokenMutation } from '~/modules/general/query-mutations';
import { addMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { SubmitButton, buttonVariants } from '~/modules/ui/button';
import { AcceptInviteRoute } from '~/routes/general';
import type { TokenData } from '~/types/common';
import { cn } from '~/utils/cn';

const AcceptInvite = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams({ from: AcceptInviteRoute.id });

  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const { mutate: checkToken, isPending: isChecking } = useCheckTokenMutation();

  const { mutate: acceptInvite, isPending } = useAcceptInviteMutation();

  const onSubmit = () => {
    acceptInvite(
      { token },
      {
        onSuccess: (data) => {
          if (data) addMenuItem(data.newItem, data.sectionName);
          toast.success(t('common:invitation_accepted'));
          navigate({ to: tokenData?.organizationSlug ? `/${tokenData.organizationSlug}` : config.defaultRedirectPath });
        },
        onError: (error) => setError(error),
      },
    );
  };

  useEffect(() => {
    if (!token) return;

    checkToken(token, { onSuccess: (result) => setTokenData(result), onError: (error) => setError(error) });
  }, [token]);

  if (isChecking) return <Spinner />;

  return (
    <>
      <h1 className="text-2xl text-center">{t('common:accept_invite')}</h1>

      <p className="font-light mb-4">{t('common:accept_invite_text', { email: tokenData?.email, organization: tokenData?.organizationName })}</p>

      {tokenData?.email && !error ? (
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
      ) : (
        <div className="max-w-[32rem] m-4 flex flex-col items-center text-center">
          {/* TODO: we should move this to a reusable auth error message component ? */}
          {error && (
            <>
              <span className="text-muted-foreground text-sm">{t(`common:error.${error.type}`)}</span>
              <Link to="/auth/sign-in" preload={false} className={cn(buttonVariants({ size: 'lg' }), 'mt-8')}>
                {t('common:sign_in')}
                <ArrowRight size={16} className="ml-2" />
              </Link>
            </>
          )}
          {isPending && <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />}
        </div>
      )}
    </>
  );
};

export default AcceptInvite;
