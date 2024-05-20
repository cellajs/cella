import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';
import { Button, buttonVariants } from '~/modules/ui/button';
import AuthPage from './auth-page';

import { acceptInviteJsonSchema } from 'backend/modules/general/schema';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ApiError } from '~/api';
import { acceptInvite as baseAcceptInvite } from '~/api/general';
import { checkToken as baseCheckToken } from '~/api/general';
import { useMutation } from '~/hooks/use-mutations';
import { cn } from '~/lib/utils';
import { Form } from '~/modules/ui/form';
import { LegalNotice } from './sign-up-form';

const formSchema = acceptInviteJsonSchema;

const Accept = () => {
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
        to: '/welcome',
      });
    },
    onError: (error) => {
      setError(error);
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: '',
    },
  });

  const onAccept = () => {
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
      <Form {...form}>
        <h1 className="text-2xl text-center">
          {t('common:accept_invitation')} <br />{' '}
          {email && (
            <span className="font-light text-xl">
              {t('common:for')} {email}
            </span>
          )}
        </h1>

        {email && !error ? (
          <div className="space-y-4">
            <LegalNotice />
            <Button type="submit" loading={isPending} className="w-full" onClick={onAccept}>
              {t('common:accept')}
              <ArrowRight size={16} className="ml-2" />
            </Button>

            {/* TODO <OauthOptions actionType="acceptInvite" /> */}
          </div>
        ) : (
          <div className="max-w-[32rem] m-4 flex flex-col items-center text-center">
            {/* TODO: we need a render error message component ? */}
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
      </Form>
    </AuthPage>
  );
};

export default Accept;
