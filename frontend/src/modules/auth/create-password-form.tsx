import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import { SubmitButton } from '~/modules/ui/button';

import { passwordSchema } from 'backend/utils/schema/common-schemas';
import { config } from 'config';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import type { ApiError } from '~/lib/api';
import { useResetPasswordMutation } from '~/modules/auth/query-mutations';
import { useCheckTokenMutation } from '~/modules/general/query-mutations';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { CreatePasswordWithTokenRoute } from '~/routes/auth';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));

const formSchema = z.object({
  password: passwordSchema,
});

const CreatePasswordForm = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams({ from: CreatePasswordWithTokenRoute.id });

  const [email, setEmail] = useState('');
  const [tokenError, setError] = useState<ApiError | null>(null);

  // Check reset password token and get email
  const { mutate: checkToken } = useCheckTokenMutation();

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
    if (!token) return;

    checkToken({ token }, { onSuccess: (result) => setEmail(result.email), onError: (error) => setError(error) });
  }, [token]);

  return (
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
          <SubmitButton loading={isPending} className="w-full">
            {t('common:reset')}
            <ArrowRight size={16} className="ml-2" />
          </SubmitButton>
        </form>
      ) : (
        <div className="max-w-[32rem] m-4 flex flex-col items-center text-center">
          {tokenError && <span className="text-muted-foreground text-sm">{t(`error:${tokenError.type}`)}</span>}
          {isPending && <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />}
        </div>
      )}
    </Form>
  );
};

export default CreatePasswordForm;
