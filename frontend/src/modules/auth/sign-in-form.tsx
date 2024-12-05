import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { authBodySchema } from 'backend/modules/auth/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';

import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

import { config } from 'config';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useEffect } from 'react';
import { signIn as baseSignIn } from '~/api/auth';
import { useMutation } from '~/hooks/use-mutations';
import type { TokenData } from '~/modules/auth';
import { ResetPasswordRequest } from '~/modules/auth/reset-password/dialog';
import { SignInRoute } from '~/routes/auth';
import { useUserStore } from '~/store/user';

const formSchema = authBodySchema;

export const SignInForm = ({
  tokenData,
  email,
  resetToInitialStep,
}: { tokenData: TokenData | null; email: string; resetToInitialStep: () => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lastUser, clearLastUser } = useUserStore();

  const { redirect } = useSearch({ from: SignInRoute.id });

  const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;

  const { mutate: signIn, isPending } = useMutation({
    mutationFn: baseSignIn,
    onSuccess: ({ emailVerified }) => {
      // Redirect to the invite page if token is present
      // Otherwise, redirect to a redirect URL or to home
      const verifiedUserTo = tokenData ? '/auth/invite/$token' : redirect || config.defaultRedirectPath;
      const params = { token: tokenData?.token };

      navigate({ to: emailVerified ? verifiedUserTo : '/auth/verify-email', params, replace: true });
    },
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: email,
      password: '',
    },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const token = tokenData?.token;
    signIn({ ...values, token });
  };

  const cancel = () => {
    clearLastUser();
    resetToInitialStep();
  };

  useEffect(() => {
    if (tokenData?.email) form.setValue('email', tokenData.email);
  }, [tokenData]);

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {tokenData ? t('common:invite_sign_in') : lastUser ? t('common:welcome_back') : t('common:sign_in_as')} <br />
        {!tokenData && (
          <Button variant="ghost" onClick={cancel} className="font-light mt-2 text-xl">
            {email}
            <ChevronDown size={16} className="ml-2" />
          </Button>
        )}
      </h1>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 !mt-0">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="hidden">
              <FormControl>
                <Input {...field} disabled type="email" autoComplete="off" placeholder={t('common:email')} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {enabledStrategies.includes('password') && (
          <>
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                // Custom css due to html injection by browser extensions
                <FormItem className="gap-0">
                  <FormControl>
                    <Input type="password" autoFocus {...field} autoComplete="current-password" placeholder={t('common:password')} />
                  </FormControl>
                  <FormMessage className="mt-2" />
                </FormItem>
              )}
            />

            <SubmitButton loading={isPending} className="w-full">
              {t('common:sign_in')}
              <ArrowRight size={16} className="ml-2" />
            </SubmitButton>
            <ResetPasswordRequest email={email} />
          </>
        )}
      </form>
    </Form>
  );
};
