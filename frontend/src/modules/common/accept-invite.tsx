import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import type { checkTokenSchema } from 'backend/modules/general/schema';
import { config } from 'config';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useMutation } from '~/hooks/use-mutations';
import type { ApiError } from '~/lib/api';
import AuthPage from '~/modules/auth/auth-page';
import Spinner from '~/modules/common/spinner';
import { acceptInvite as baseAcceptInvite, checkToken as baseCheckToken } from '~/modules/general/api';
import { addMenuItem } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { SubmitButton, buttonVariants } from '~/modules/ui/button';
import { acceptInviteRoute } from '~/routes/general';
import { cn } from '~/utils/cn';

type TokenData = z.infer<typeof checkTokenSchema>;

const AcceptInvite = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams({ from: acceptInviteRoute.id });

  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const { mutate: checkToken, isPending: isChecking } = useMutation({
    mutationFn: baseCheckToken,
    onSuccess: (result) => setTokenData(result),
    onError: (error) => setError(error),
  });

  const { mutate: acceptInvite, isPending } = useMutation({
    mutationFn: baseAcceptInvite,
    onSuccess: (data) => {
      if (data) addMenuItem(data.newItem, data.sectionName);
      toast.success(t('common:invitation_accepted'));
      navigate({
        to: tokenData?.organizationSlug ? `/${tokenData.organizationSlug}` : config.defaultRedirectPath,
      });
    },
    onError: (error) => setError(error),
  });

  const onSubmit = () => {
    acceptInvite({ token });
  };

  useEffect(() => {
    if (!token) return;
    checkToken(token);
  }, [token]);

  if (isChecking) return <Spinner />;

  return (
    <AuthPage>
      <h1 className="text-2xl text-center">{t('common:accept_invite')}</h1>

      <p className="font-light mb-4">{t('common:accept_invite_text', { email: tokenData?.email, organization: tokenData?.organizationName })}</p>

      {tokenData?.email && !error ? (
        <div className="space-y-4">
          <SubmitButton loading={isPending} className="w-full" onClick={onSubmit}>
            {t('common:accept')}
            <ArrowRight size={16} className="ml-2" />
          </SubmitButton>
        </div>
      ) : (
        <div className="max-w-[32rem] m-4 flex flex-col items-center text-center">
          {/* TODO: we should move this to a reusable auth error message component ? */}
          {error && (
            <>
              <span className="text-muted-foreground text-sm">{t(`common:error.${error.type}`)}</span>
              <Link to="/auth/sign-in" className={cn(buttonVariants({ size: 'lg' }), 'mt-8')}>
                {t('common:sign_in')}
                <ArrowRight size={16} className="ml-2" />
              </Link>
            </>
          )}
          {isPending && <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />}
        </div>
      )}
    </AuthPage>
  );
};

export default AcceptInvite;
