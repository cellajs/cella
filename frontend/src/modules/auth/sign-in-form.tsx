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
import type { TokenData } from '~/types/common';

const formSchema = emailPasswordBodySchema;

interface Props {
  tokenData: TokenData | null;
  email: string;
  resetSteps: () => void;
  emailEnabled: boolean;
}

export const SignInForm = ({ tokenData, email, resetSteps, emailEnabled }: Props) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lastUser, clearLastUser } = useUserStore();

  const { redirect, token } = useSearch({ from: AuthenticateRoute.id });

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
      { ...values, token },
      {
        onSuccess: (emailVerified) => {
          // Redirect to invitation page if token is present
          // Otherwise, redirect to a redirect URL or to home
          const verifiedUserTo = token ? '/auth/invitation/$token' : redirect || config.defaultRedirectPath;
          const params = { token };

          navigate({ to: emailVerified ? verifiedUserTo : '/auth/verify-email', params, replace: true });
        },
        onError: (error) => {
          if (error.type !== 'invalid_password') return;
          document.getElementById('password-field')?.focus();
          form.reset(form.getValues());
        },
      },
    );
  };

  const cancel = () => {
    clearLastUser();
    resetSteps();
  };

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {tokenData
          ? t('common:invite_sign_in', { orgName: tokenData.organizationName })
          : lastUser
            ? t('common:welcome_back')
            : t('common:sign_in_as')}{' '}
        <br />
        {!tokenData && (
          <Button variant="ghost" onClick={cancel} className="font-light mt-2 text-xl">
            {email}
            <ChevronDown size={16} className="ml-2" />
          </Button>
        )}
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
                        autoFocus
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
              <RequestPasswordDialog email={email} />
            </>
          )}
        </form>
      )}
    </Form>
  );
};
