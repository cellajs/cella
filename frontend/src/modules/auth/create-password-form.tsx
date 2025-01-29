import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { Button, SubmitButton } from '~/modules/ui/button';

import { useQuery } from '@tanstack/react-query';
import { passwordSchema } from 'backend/utils/schema/common-schemas';
import { config } from 'config';
import { ArrowRight } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { useResetPasswordMutation } from '~/modules/auth/query-mutations';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { CreatePasswordWithTokenRoute } from '~/routes/auth';
import Spinner from '../common/spinner';
import { checkToken } from './api';
import AuthNotice from './auth-notice';
import { RequestPasswordDialog } from './request-password-dialog';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));

const formSchema = z.object({
  password: passwordSchema,
});

const CreatePasswordForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams({ from: CreatePasswordWithTokenRoute.id });
  const { tokenId } = useSearch({ from: CreatePasswordWithTokenRoute.id });

  // Reset password and sign in
  const { mutate: resetPassword, isPending, error: resetPasswordError } = useResetPasswordMutation();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: '',
    },
  });

  // Submit new password
  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const { password } = values;
    resetPassword({ token, password }, { onSuccess: () => navigate({ to: config.defaultRedirectPath }) });
  };

  const tokenQueryOptions = {
    queryKey: ['tokenData', tokenId],
    queryFn: async () => {
      if (!tokenId || !token) return;
      return checkToken({ id: tokenId, type: 'password_reset' });
    },
    staleTime: 0,
  };

  const { data, isLoading, error } = useQuery(tokenQueryOptions);

  if (isLoading) return <Spinner className="h-10 w-10" />;
  if (error || resetPasswordError)
    return (
      <AuthNotice error={error || resetPasswordError}>
        <RequestPasswordDialog email={data?.email}>
          <Button size="lg">{t('common:forgot_password')}</Button>
        </RequestPasswordDialog>
      </AuthNotice>
    );
  if (!data?.email) return null;

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {t('common:reset_password')} <br />{' '}
        {data.email && (
          <Button variant="ghost" disabled className="font-light mt-2 text-xl">
            {data.email}
          </Button>
        )}
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
        <SubmitButton loading={isPending} className="w-full">
          {t('common:reset')}
          <ArrowRight size={16} className="ml-2" />
        </SubmitButton>
      </form>
    </Form>
  );
};

export default CreatePasswordForm;
