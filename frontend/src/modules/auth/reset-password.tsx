import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useParams } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import * as z from 'zod';
import AuthPage from '~/modules/auth/auth-page';
import { Button } from '~/modules/ui/button';

import { onlineManager } from '@tanstack/react-query';
import { passwordSchema } from 'backend/lib/common-schemas';
import { config } from 'config';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Suspense, lazy, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { ApiError } from '~/api';
import { resetPassword as baseResetPassword } from '~/api/auth';
import { checkToken as baseCheckToken } from '~/api/general';
import { useMutation } from '~/hooks/use-mutations';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { ResetPasswordRoute } from '~/routes/auth';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));

const formSchema = z.object({
  password: passwordSchema,
});

const ResetPassword = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = useParams({ from: ResetPasswordRoute.id });

  const [email, setEmail] = useState('');
  const [tokenError, setError] = useState<ApiError | null>(null);

  // Check reset password token and get email
  const { mutate: checkToken } = useMutation({
    mutationFn: baseCheckToken,
    onSuccess: (result) => setEmail(result.email),
    onError: (error) => setError(error),
  });

  // Reset password and sign in
  const { mutate: resetPassword, isPending } = useMutation({
    mutationFn: baseResetPassword,
    onSuccess: () => {
      toast.success(t('common:success.password_reset'));
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
    if (!onlineManager.isOnline()) return toast.warning(t('common:action.offline.text'));

    const { password } = values;
    resetPassword({ token, password });
  };

  useEffect(() => {
    if (!token) return;

    checkToken(token);
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
            <Button type="submit" loading={isPending} className="w-full">
              {t('common:reset')}
              <ArrowRight size={16} className="ml-2" />
            </Button>
          </form>
        ) : (
          <div className="max-w-[32rem] m-4 flex flex-col items-center text-center">
            {tokenError && <span className="text-muted-foreground text-sm">{t(`common:error.${tokenError.type}`)}</span>}
            {isPending && <Loader2 className="text-muted-foreground h-6 w-6 animate-spin" />}
          </div>
        )}
      </Form>
    </AuthPage>
  );
};

export default ResetPassword;
