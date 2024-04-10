import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { acceptInviteJsonSchema } from 'backend/modules/auth/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';
import { Button, buttonVariants } from '~/modules/ui/button';
import AuthPage from './auth-page';
import OauthOptions from './oauth-options';

import { ArrowRight, Loader2 } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ApiError } from '~/api';
import { acceptInvite as baseAcceptInvite } from '~/api/authentication';
import { checkToken as baseCheckToken } from '~/api/general';
import { useMutation } from '~/hooks/use-mutations';
import { cn } from '~/lib/utils';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { LegalNotice } from './sign-up-form';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));

const formSchema = acceptInviteJsonSchema;

const Accept = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token }: { token: string } = useParams({ strict: false });

  const [email, setEmail] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  const { mutate: checkToken } = useMutation({
    mutationFn: baseCheckToken,
    onSuccess: (email) => setEmail(email),
    onError: (error) => setError(error),
  });
  const { mutate: acceptInvite, isPending } = useMutation({
    mutationFn: baseAcceptInvite,
    onSuccess: (path) => {
      toast.success(t('common:invitation_accepted'));
      navigate({
        to: path,
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

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    acceptInvite({
      token,
      password: values.password,
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
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <LegalNotice />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Input type="password" autoFocus placeholder={t('common:new_password')} autoComplete="new-password" {...field} />
                      <Suspense>
                        <PasswordStrength password={form.getValues('password') || ''} minLength={8} />
                      </Suspense>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" loading={isPending} className="w-full">
              {t('common:accept')}
              <ArrowRight size={16} className="ml-2" />
            </Button>

            <OauthOptions actionType="acceptInvite" />
          </form>
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
