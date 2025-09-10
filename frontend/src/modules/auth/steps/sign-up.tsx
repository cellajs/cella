import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { appConfig } from 'config';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { type SignUpData, type SignUpResponse, type SignUpWithTokenData, type SignUpWithTokenResponse, signUp, signUpWithToken } from '~/api.gen';
import { zSignUpData } from '~/api.gen/zod.gen';
import type { ApiError } from '~/lib/api';
import { LegalNotice } from '~/modules/auth/steps/legal-notice';
import { useAuthStepsContext } from '~/modules/auth/steps/provider-context';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const PasswordStrength = lazy(() => import('~/modules/auth/password-strength'));

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;
const emailEnabled = enabledStrategies.includes('password') || enabledStrategies.includes('passkey');

const formSchema = zSignUpData.shape.body.unwrap();
type FormValues = z.infer<typeof formSchema>;

/**
 * Handles user sign-up, including standard registration and invitation token flow.
 */
export const SignUpStep = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { email, tokenData, setStep, resetSteps } = useAuthStepsContext();

  const { token } = useSearch({ from: '/publiclayout/authlayout/auth/authenticate' });

  const isMobile = window.innerWidth < 640;

  // Handle basic sign up
  const { mutate: _signUp, isPending } = useMutation<SignUpResponse, ApiError, NonNullable<SignUpData['body']>>({
    mutationFn: (body) => signUp({ body }),
    onSuccess: () => navigate({ to: '/auth/email-verification/$reason', params: { reason: 'signup' }, replace: true }),
    onError: (error: ApiError) => {
      // If there is an unclaimed invitation token, redirect to error page
      if (error.type === 'invite_takes_priority') return setStep('error', form.getValues('email'), error);
    },
  });

  // Handle sign up with token to accept invitation
  const { mutate: _signUpWithToken, isPending: isPendingWithToken } = useMutation<
    SignUpWithTokenResponse,
    ApiError,
    NonNullable<SignUpWithTokenData['body']> & SignUpWithTokenData['path']
  >({
    mutationFn: ({ token, ...body }) => signUpWithToken({ body, path: { token } }),
    onSuccess: ({ redirectPath }) => {
      const to = redirectPath ?? appConfig.defaultRedirectPath;
      return navigate({ to, replace: true });
    },
  });

  // Create form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email, password: '' },
  });

  // Handle submit action
  const onSubmit = (formValues: FormValues) => {
    if (token) return _signUpWithToken({ ...formValues, token });
    _signUp({ ...formValues });
  };

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {tokenData?.organizationSlug
          ? t('common:invite_accept_proceed')
          : tokenData
            ? t('common:invite_create_account')
            : `${t('common:create_resource', { resource: t('common:account').toLowerCase() })}?`}{' '}
        <br />
        {!tokenData && (
          <Button variant="ghost" onClick={resetSteps} className="mx-auto flex max-w-full truncate font-light mt-2 sm:text-xl bg-foreground/10">
            <span className="truncate">{email}</span>
            <ChevronDown size={16} className="ml-1" />
          </Button>
        )}
      </h1>

      <LegalNotice email={email} mode="signup" />

      {emailEnabled && (
        <form onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="hidden">
                <FormControl>
                  <Input {...field} type="email" disabled={true} readOnly={true} placeholder={t('common:email')} />
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
                      <div className="relative">
                        <Input type="password" autoFocus={!isMobile} placeholder={t('common:new_password')} autoComplete="new-password" {...field} />
                        <Suspense>
                          <PasswordStrength password={form.getValues('password') || ''} minLength={8} />
                        </Suspense>
                      </div>
                    </FormControl>
                    <FormMessage className="mt-2" />
                  </FormItem>
                )}
              />
              <SubmitButton loading={isPending || isPendingWithToken} className="w-full">
                {t('common:sign_up')}
                <ArrowRight size={16} className="ml-2" />
              </SubmitButton>
            </>
          )}
        </form>
      )}
    </Form>
  );
};
