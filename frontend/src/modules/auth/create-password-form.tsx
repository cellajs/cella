import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { Button, SubmitButton } from '~/modules/ui/button';

import { useMutation, useQuery } from '@tanstack/react-query';
import { config } from 'config';
import { ArrowRight } from 'lucide-react';
import { Suspense, lazy } from 'react';
import { checkToken, createPassword } from '~/modules/auth/api';
import AuthNotice from '~/modules/auth/notice';
import { RequestPasswordDialog } from '~/modules/auth/request-password-dialog';
import Spinner from '~/modules/common/spinner';
import { createToast } from '~/modules/common/toaster';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { CreatePasswordWithTokenRoute } from '~/routes/auth';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));

const formSchema = z.object({ password: z.string().min(8).max(100) });

const CreatePasswordForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { token } = useParams({ from: CreatePasswordWithTokenRoute.id });
  const { tokenId } = useSearch({ from: CreatePasswordWithTokenRoute.id });

  // Reset password & sign in
  const {
    mutate: _createPassword,
    isPending,
    error: resetPasswordError,
  } = useMutation({
    mutationFn: createPassword,
    onSuccess: () => {
      createToast(t('common:success.password_reset'), 'success');
      navigate({ to: config.defaultRedirectPath });
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: '',
    },
  });

  // Submit new password
  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const { password } = values;
    _createPassword({ token, password });
  };

  // Check token id first
  const tokenQueryOptions = {
    queryKey: [],
    queryFn: async () => {
      if (!tokenId || !token) return;
      return checkToken({ id: tokenId, type: 'password_reset' });
    },
  };

  const { data, isLoading, error } = useQuery(tokenQueryOptions);

  if (isLoading) return <Spinner className="h-10 w-10" />;

  // If error, allow to request new password reset
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
