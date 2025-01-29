import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { Button, SubmitButton } from '~/modules/ui/button';

import { passwordSchema } from 'backend/utils/schema/common-schemas';
import { config } from 'config';
import { ArrowRight } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import type { ApiError } from '~/lib/api';
import { useResetPasswordMutation } from '~/modules/auth/query-mutations';
import { useCheckTokenMutation } from '~/modules/general/query-mutations';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { CreatePasswordWithTokenRoute } from '~/routes/auth';
import Spinner from '../common/spinner';
import AuthNotice from './auth-notice';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));

const formSchema = z.object({
  password: passwordSchema,
});

const CreatePasswordForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams({ from: CreatePasswordWithTokenRoute.id });
  const { tokenId } = useSearch({ from: CreatePasswordWithTokenRoute.id });

  const [email, setEmail] = useState('');
  const [error, setError] = useState<ApiError | null>(null);

  // Check reset password token and get email
  const { mutate: checkToken, isPending: isChecking } = useCheckTokenMutation();

  // Reset password and sign in
  const { mutate: resetPassword, isPending } = useResetPasswordMutation();

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

  useEffect(() => {
    if (!token || !tokenId) return;

    checkToken({ id: tokenId }, { onSuccess: (result) => setEmail(result.email), onError: (error) => setError(error) });
  }, [token]);

  if (isChecking) return <Spinner />;

  if (error) return <AuthNotice error={error} />;

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {t('common:reset_password')} <br />{' '}
        {email && (
          <Button variant="ghost" disabled className="font-light mt-2 text-xl">
            {email}
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
