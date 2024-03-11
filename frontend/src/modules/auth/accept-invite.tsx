import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from '@tanstack/react-router';
import { acceptInviteJsonSchema } from 'backend/modules/auth/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { Button } from '~/modules/ui/button';
import AuthPage from '.';
import OauthOptions from './oauth-options';

import { ArrowRight } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { acceptInvite, checkInvite } from '~/api/authentication';
import { useApiWrapper } from '~/hooks/use-api-wrapper';
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

  const [apiWrapper, pending] = useApiWrapper();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    apiWrapper(
      () =>
        acceptInvite({
          token,
          password: values.password,
        }),
      (path) => {
        navigate({
          to: path,
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
          {t('common:accept_invitation')} <br />{' '}
          <span className="font-light text-xl">
            {t('common:for')} {email}
          </span>
        </h1>

        <LegalNotice />

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
                      <PasswordStrength password={form.getValues('password') || ''} minLength={8} />
                    </Suspense>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" loading={pending} className="w-full">
            {t('common:accept')}
            <ArrowRight size={16} className="ml-2" />
          </Button>
        </form>
      </Form>
      <OauthOptions actionType="acceptInvite" />
    </AuthPage>
  );
};

export default Accept;
