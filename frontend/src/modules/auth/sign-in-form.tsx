import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { emailPasswordBodySchema } from 'backend/modules/auth/schema';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type * as z from 'zod';

import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';

import { config } from 'config';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useSignInMutation } from '~/modules/auth/query-mutations';
import { RequestPasswordDialog } from '~/modules/auth/request-password-dialog';
import { AuthenticateRoute } from '~/routes/auth';
import { useUserStore } from '~/store/user';

const formSchema = emailPasswordBodySchema;

interface Props {
  email: string;
  resetSteps: () => void;
  emailEnabled: boolean;
}

// Either simply sign in with password or sign in with token to also accept organization invitation
export const SignInForm = ({ email, resetSteps, emailEnabled }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lastUser, clearLastUser } = useUserStore();
  const isMobile = window.innerWidth < 640;

  const { redirect, token, tokenId } = useSearch({ from: AuthenticateRoute.id });

  const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: email,
      password: '',
    },
  });

  const { mutate: signIn, isPending } = useSignInMutation();

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    signIn(
      { ...values },
      {
        onSuccess: (emailVerified) => {
          if (!emailVerified) return navigate({ to: '/auth/email-verification', replace: true });

          if (token && tokenId) return navigate({ to: '/invitation/$token', params: { token }, search: { tokenId }, replace: true });
          navigate({ to: redirect || config.defaultRedirectPath, replace: true });
        },
        onError: (error) => {
          if (error?.status === 404) return resetSteps();

          if (error.type !== 'invalid_password') return;
          document.getElementById('password-field')?.focus();
          form.reset(form.getValues());
        },
      },
    );
  };

  const resetAuth = () => {
    clearLastUser();
    resetSteps();
  };

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {token ? t('common:invite_sign_in') : lastUser ? t('common:welcome_back') : t('common:sign_in_as')} <br />
        <Button variant="ghost" onClick={resetAuth} disabled={!!token} className="font-light mt-2 text-xl">
          {email}
          {!token && <ChevronDown size={16} className="ml-2" />}
        </Button>
      </h1>
      {emailEnabled && (
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
                      <Input
                        type="password"
                        id="password-field"
                        autoFocus={!isMobile}
                        {...field}
                        autoComplete="current-password"
                        placeholder={t('common:password')}
                      />
                    </FormControl>
                    <FormMessage className="mt-2" />
                  </FormItem>
                )}
              />

              <SubmitButton loading={isPending} className="w-full">
                {t('common:sign_in')}
                <ArrowRight size={16} className="ml-2" />
              </SubmitButton>
              <RequestPasswordDialog email={email}>
                <Button variant="ghost" size="sm" className="w-full font-normal">
                  {t('common:forgot_password')}
                </Button>
              </RequestPasswordDialog>
            </>
          )}
        </form>
      )}
    </Form>
  );
};
