import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from '@tanstack/react-router';
import { resetPasswordJsonSchema } from 'backend/modules/auth/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';
import { Button } from '~/modules/ui/button';
import AuthPage from '.';

import { ArrowRight, Loader2 } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import type { ApiError } from '~/api';
import { resetPassword } from '~/api/authentication';
import { checkToken } from '~/api/general';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));

const formSchema = resetPasswordJsonSchema;

const ResetPassword = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token }: { token: string } = useParams({ strict: false });

  const [email, setEmail] = useState('');
  const [tokenError, setError] = useState<ApiError | null>(null);

  const [apiWrapper, pending] = useApiWrapper();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    apiWrapper(
      () => resetPassword(token, values.password),
      () => {
        navigate({
          to: '/',
        });
      },
    );
  };

  useEffect(() => {
    apiWrapper(
      () => checkToken(token),
      (data) => setEmail(data),
      (error) => setError(error),
    );
  }, [token]);

  return (
    <AuthPage>
      <Form {...form}>
        <h1 className="text-2xl text-center">
          {t('common:reset_password')} <br />{' '}
          {email && (
            <span className="font-light text-xl">
              {t('common:for')} {email}
            </span>
          )}
        </h1>
        {email ? (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <div className="relative">
                      <Input type="password" autoFocus placeholder={t('common:new_password')} autoComplete="new-password" {...field} />
                      <Suspense>
                        <PasswordStrength password={form.getValues('password')} minLength={8} />
                      </Suspense>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" loading={pending} className="w-full">
              {t('common:reset')}
              <ArrowRight size={16} className="ml-2" />
            </Button>
          </form>
        ) : (
          <div className="max-w-[32rem] m-4 flex flex-col items-center text-center">
            {tokenError && <span className="text-muted-foreground text-sm">{t(`common:error.${tokenError.type}`)}</span>}
            {pending && <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />}
          </div>
        )}
      </Form>
    </AuthPage>
  );
};

export default ResetPassword;
