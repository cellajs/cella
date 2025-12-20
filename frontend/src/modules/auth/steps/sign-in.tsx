import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { appConfig } from 'config';
import { ArrowRightIcon, ChevronDownIcon } from 'lucide-react';
import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { type SignInData, type SignInResponse, signIn } from '~/api.gen';
import { zSignUpData } from '~/api.gen/zod.gen';
import type { ApiError } from '~/lib/api';
import { RequestPasswordDialog } from '~/modules/auth/request-password-dialog';
import { Button, SubmitButton } from '~/modules/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '~/modules/ui/form';
import { Input } from '~/modules/ui/input';
import { EmailVerificationRoute, MfaRoute } from '~/routes/auth-routes';
import { useAuthStore } from '~/store/auth';
import { useUserStore } from '~/store/user';
import { defaultOnInvalid } from '~/utils/form-on-invalid';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;
const emailEnabled = enabledStrategies.includes('password') || enabledStrategies.includes('passkey');

const formSchema = zSignUpData.shape.body.unwrap();
type FormValues = z.infer<typeof formSchema>;

/**
 * Handles user sign-in, including standard password login and token-based invitation flow.
 */
export const SignInStep = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { email, resetSteps } = useAuthStore();

  const passwordRef = useRef<HTMLInputElement>(null);

  const { lastUser, clearUserStore, setLastUser } = useUserStore();
  const { redirect: encodedRedirect, tokenId } = useSearch({ from: '/publicLayout/authLayout/auth/authenticate' });

  const redirect = decodeURIComponent(encodedRedirect || '');
  const isMobile = window.innerWidth < 640;

  // Set up form
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email, password: '' },
  });

  // Handle sign in
  const { mutate: _signIn, isPending } = useMutation<SignInResponse, ApiError, NonNullable<SignInData['body']>>({
    mutationFn: (body) => signIn({ body }),
    onSuccess: ({ emailVerified, mfa }) => {
      if (mfa || !emailVerified) {
        if (mfa) setLastUser({ email, mfaRequired: true });
        const navigateInfo = !emailVerified
          ? { to: EmailVerificationRoute.to, params: { reason: 'signin' } }
          : { to: MfaRoute.to };
        navigate({ ...navigateInfo, replace: true });
        return;
      }

      // Go to pending invitation in home if token is provided, otherwise use provided redirect or default path
      const redirectPath = tokenId
        ? `/home?skipWelcome=true`
        : redirect?.startsWith('/')
          ? redirect
          : appConfig.defaultRedirectPath;

      navigate({
        to: redirectPath,
        replace: true,
        ...(tokenId && { search: { tokenId } }),
      });
    },
    onError: (error: ApiError) => {
      if (error?.status === 404) return resetSteps();

      if (error.type !== 'invalid_password') return;
      if (!isMobile) passwordRef.current?.focus();
      form.reset(form.getValues());
    },
  });

  const onSubmit = (body: FormValues) => _signIn({ ...body });

  const resetAuth = () => {
    clearUserStore();
    resetSteps();
  };

  return (
    <Form {...form}>
      <h1 className="text-2xl text-center">
        {tokenId ? t('common:invite_sign_in') : lastUser ? t('common:welcome_back') : t('common:sign_in_as')} <br />
        <Button
          variant="ghost"
          onClick={resetAuth}
          disabled={!!tokenId}
          className="mx-auto flex max-w-full truncate font-light mt-2 sm:text-xl bg-foreground/10"
        >
          <span className="truncate">{email}</span>
          {!tokenId && <ChevronDownIcon size={16} className="ml-1" />}
        </Button>
      </h1>
      {emailEnabled && (
        <form onSubmit={form.handleSubmit(onSubmit, defaultOnInvalid)} className="flex flex-col gap-4 mt-0!">
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
                        ref={passwordRef}
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
                <ArrowRightIcon size={16} className="ml-2" />
              </SubmitButton>
              <RequestPasswordDialog email={email} onEmailChange={resetSteps}>
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
