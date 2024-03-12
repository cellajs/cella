import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from '@tanstack/react-router';
import { resetPasswordJsonSchema } from 'backend/modules/auth/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';
import { Button } from '~/modules/ui/button';
import AuthPage from '.';

import { ArrowRight } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { checkInvite, resetPassword } from '~/api/authentication';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));

const formSchema = resetPasswordJsonSchema;

const ResetPassword = () => {
  const { t } = useTranslation();
  const { token }: { token: string } = useParams({ strict: false });
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

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
    checkInvite(token)
      .then((data) => {
        setEmail(data);
      })
      .catch(() => {
        navigate({
          to: '/auth/sign-in',
        });
      });
  }, [token]);

  return (
    <AuthPage>
      <Form {...form}>
        <h1 className="text-2xl text-center">
          {t('common:reset_password')} <br />{' '}
          <span className="font-light text-xl">
            {t('common:for')} {email}
          </span>
        </h1>
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
      </Form>
    </AuthPage>
  );
};

export default ResetPassword;
